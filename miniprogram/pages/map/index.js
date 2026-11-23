const identity = require('../../utils/identity');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Map — native <map> replaces the web's Leaflet. Photo pins become bundled
// composed photo markers; the selected memory shows a callout, and the place card
// (search, filters, bookmark, recenter) mirrors the web interactions.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');
const locations = require('../../utils/locations');

const mapMarkers = require('../../utils/mapMarkers');
const mapLayout = require('../../utils/mapLayout');
const mapStack = require('../../utils/mapStack');
const mapProjection = require('../../utils/mapProjection');
const mapCamera = require('../../utils/mapCamera');
const imageCache = require('../../utils/imageCache');
// The selected card is a PREVIEW surface, not a detail page. Its rendered box is 280rpx square;
// measured on the attached 3.5x device that is 469 device pixels, so a 512px long-edge variant
// covers it with a small margin and is still ~40x smaller than a 10 MB legacy original. The
// marker/list variant (384px) stays as it is: it already covers the 280px marker and the 215px
// list cell, and re-pointing it would churn a tested, documented path for no gain.
const CARD_PREVIEW_LONG_EDGE = 512;
const restaurantCategory = require('../../utils/restaurantCategory');

// Marker photos arrive asynchronously and each one used to trigger its own whole-array
// setData({markers}). That is the most expensive write the map can make: every write
// clones the entire marker list across the JS -> native bridge. Photos that become ready
// inside the same display frame are therefore collected and published once. The window is
// one frame, not a fixed pause: it adds no visible latency to a photo that is already the
// only one ready, and it collapses a burst into a single bridge write.
const MARKER_PHOTO_BATCH_MS = 16;

// The zoom stepper's only camera channel is the bound `scale` prop, and that prop
// floors fractional values (13.32 -> 13, 13.5 -> 13) on both the IDE and a real
// device, so the stepper may only ever target a whole level. Observed zoom stays a
// separate read-only value: it feeds grouping and never becomes a camera command.
const ZOOM_MIN_SCALE = 3;
const ZOOM_MAX_SCALE = 18;
// A native scale this close to a whole level counts as being at that level.
const ZOOM_LEVEL_EPSILON = 0.05;
// Compact close duration when switching from an open cluster drawer to another marker so the
// fold -> camera pan -> open handoff feels crisp while manual close stays at 320ms.
const DRAWER_SWITCH_CLOSE_MS = 200;
const DRAWER_CLOSE_SETTLE_PAD_MS = 20;
// Skip pointless micro-panning when a tapped cluster is already within 24px of its framed slot.
const CLUSTER_FOCUS_SKIP_PX = 24;

// How long a Map session may go without re-reading the product data from the cloud.
//
// This is deliberately NOT the correctness mechanism. Local writes publish through the store
// subscription, an actor transition republishes, and a queued outbox is flushed by the sync
// itself - so every change this device can observe already reaches the page without a read.
// What a read adds is remote changes made on another device, and there is no push channel for
// those, so a bounded refresh window is the honest way to keep them reachable. A primary-tab
// switch is NOT a reason to read: that is the whole point of this round.
const MAP_CLOUD_SYNC_INTERVAL_MS = 30000;

function visibleMemories(memories, query, filter) {
  const q = (query || '').toLowerCase().trim();
  return memories.filter(function (memory) {
    const haystack = [memory.restaurant, memory.city, memory.country].concat(memory.tags).join(' ').toLowerCase();
    if (memory.locationUnknown) return false;
    const matchesQuery = haystack.indexOf(q) >= 0;
    const matchesFilter = filter === 'all'
      || (filter === 'favorites' && (memory.saved || memory.liked))
      || (filter === 'shared' && memory.shared);
    return matchesQuery && matchesFilter;
  });
}

// The active view explains zero results; unrelated pending locations do not.
function emptyMapState(query, filter, pendingCount) {
  let kind, title, text, action;
  if ((query || '').trim()) {
    kind='search'; title='No matching places'; text='Try another place, restaurant, or tag.'; action='Clear search';
  } else if (filter === 'favorites') {
    kind='favorites'; title='No favorites on the map'; text='Show all mapped memories instead.'; action='Show all memories';
  } else if (filter !== 'all') {
    kind='filter'; title='No places in this view'; text='Show all mapped memories instead.'; action='Show all memories';
  } else if (pendingCount > 0) {
    kind='pending'; title='Restaurant locations pending'; text='Older city coordinates do not identify a restaurant.'; action='Confirm restaurant locations';
  } else {
    kind='empty'; title='No memories here yet.'; text='Try another place, restaurant, or tag.'; action='Show all memories';
  }
  return {kind, title:i18n.t(title), text:i18n.t(text), action:i18n.t(action)};
}

Page({
  onFieldFocus: uiFeedback.onFieldFocus,
  onFieldBlur: uiFeedback.onFieldBlur,
  // Same shared image-failure path every other page uses (data-source + imageErrors), so the
  // selected-place photo falls back exactly like Add / Home / Us / Me photos do.
  onImageError: uiFeedback.onImageError,
  data: {
    focusedField: '', imageErrors: {}, pressedStackRoot:'',
    // Drawer motion driver. Under drawerRenderMode='native-callout' it decides whether the
    // open/close motion is a CSS transform transition inside the callout or the JS frame
    // loop. Under 'view-overlay' the transform always drives (see drawerTransformDriver),
    // because that renderer has no native callout left to frame-patch.
    //
    // A device run showed that moving this flag from false to true cut one open from ~22 JS
    // writes to 1 with zero frame writes, and the drawer still janked - so cadence was not
    // the bottleneck and that experiment is closed. This value is now kept only so the two
    // motion drivers remain independently A/B-able; it is not a pending performance fix.
    //
    // Every suite pins the driver it exercises, so no gate depends on this default.
    // See docs/reviews/map-performance-fix-round2-20260926.md (the cadence fix and its
    // measurements) and docs/reviews/map-real-device-ab-round3-20260926.md (the device A/B).
    drawerCssMotion: true,
    // Where the animated drawer ink lives. The whole A/B is this one value:
    //
    //   'native-callout'  the drawer is drawn inside the native map's customCallout, as it
    //                     always was. The ordinary overlay is only a transparent hit region.
    //   'view-overlay'    the native map keeps nothing but a STATIC root marker; the toggle,
    //                     the rows, their photos and the paging strip become ordinary views
    //                     in .map-stack-overlay, so the 320ms motion never crosses the
    //                     JS -> native map bridge.
    //
    // The second arm exists because a device run showed the drawer still janked after the
    // per-frame setData cost was removed, which rules out cadence as the bottleneck and
    // points at the customCallout compositor itself. Both arms share mapStack geometry, the
    // drawer state, paging and selection; only the renderer differs.
    //
    // The JS frame loop (startDrawerReveal) is reachable ONLY from 'native-callout' with
    // drawerCssMotion=false: 'view-overlay' has no callout to frame-patch, so
    // drawerTransformDriver() always hands it the transform. The loop itself is kept, not
    // deleted, so the native-callout arm still has both of its motion drivers.
    //
    // Currently 'view-overlay': the LOCAL REAL-DEVICE PREVIEW VALUE for arm B. It must be
    // settled by a device run before anything is committed - whether an ordinary view
    // composites more smoothly than a cover-view is not a question Node can answer, and this
    // round deliberately does NOT claim it does. Every suite pins the mode it exercises, so
    // no gate depends on this default.
    // See docs/reviews/map-overlay-drawer-round4-20260926.md.
    drawerRenderMode: 'view-overlay',
    hybridCalloutRootId: '',
    copy: i18n.copy(), locale: i18n.locale(),
    latitude: 48.8535, longitude: 2.3392,
    pendingCount: 0, demoMode: true, pendingExpanded: false,
    headerTop: 54,
    overlayTop: 174,
    query: '',
    filter: 'all',
    emptyState: null,
    showFilters: false,
    selectedId: 'comptoir',
    dusk: false,
    quiet: false,
    markers: [],
    // The bound camera channel, written only by the zoom stepper. Observed zoom
    // (mapScale) feeds grouping and is never bound back to the map.
    commandScale:13,
    // Disabled thresholds for the stepper's visual state, derived from the same
    // constants the handler clamps with so the two can never disagree.
    zoomInDisabledAt: ZOOM_MAX_SCALE - ZOOM_LEVEL_EPSILON,
    zoomOutDisabledAt: ZOOM_MIN_SCALE + ZOOM_LEVEL_EPSILON,
    stackPositionsReady:false, mapScale:13, cardCollapsed:false, clusterOpen:false, clusterChoices:[], mapDrawers:[], drawerPage:0,
    resultsCount: 0,
    selected: null,
    selectedPhoto: '',
    distanceLabel: '',
    mapError: false,
    showNativePoi: true,
  },

  onLoad() {
    try { const rect=wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) this.setData({menuButtonTop:rect.top,menuButtonHeight:rect.height,menuButtonBorderRadius:rect.height/2}); } catch(e){}

    const m = metrics.getMetrics();
    // Same value the Us screen feeds its padding-top — both headings are
    // positioned from one source, so they always sit at the same height.
    // overlayTop = heading block + search bar + gap, all derived from the
    // same headerTop the Us screen uses — one source, no per-device guessing.
    this.setData({
      headerTop: m.headerTop,
      overlayTop: m.headerTop + 120,
    });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onReady() { this.ensureMarkerRenderer(); },
  ensureMarkerRenderer() {
    if(!this.active||this.disposed||this.pinRenderer||this.markerCanvasPending||!this.createSelectorQuery)return;
    const request=this.markerCanvasRequest=(this.markerCanvasRequest||0)+1;
    this.markerCanvasPending=true;
    this.createSelectorQuery().select('#marker-render-canvas').fields({node:true,size:true}).exec(result=>{
      if(request!==this.markerCanvasRequest)return;
      this.markerCanvasPending=false;
      if(!this.active||this.disposed||!result[0]||!result[0].node)return;
      this.markerCanvas=result[0].node;
      this.initMarkerRenderer();
      // Identity recovery may mount the canvas after onReady. Enhance current pins only;
      // do not rebuild groups or issue another camera command when the canvas arrives.
      if(this.pinRenderer) {
        this.renderMarkerPhotos((this.markerGroups||[]).map(g=>g.memory),this.data.selectedId,this.markerGeneration);
        this.renderDrawerPhotos(this.markerGeneration);
      }
    });
  },
  // Measure after view updates: a fixed px allowance cannot bound rpx headings
  // and search controls on all devices. This updates hit-region clearance only.
  syncOverlayClearance() {
    if(!this.active||this.disposed||this.stackGesture||!this.createSelectorQuery)return;
    const request=this.overlayLayoutRequest=(this.overlayLayoutRequest||0)+1;
    this.createSelectorQuery().select('.map-search').boundingClientRect(rect=>{
      if(!this.active||this.disposed||this.stackGesture||request!==this.overlayLayoutRequest)return;
      if(!rect||!Number.isFinite(rect.bottom))return;
      const top=Math.ceil(rect.bottom+8);
      if(this.data.overlayTop===top)return;
      this.setData({overlayTop:top},()=>this.syncStackPositions());
    }).exec();
  },
  // The camera's composition geometry, measured — never guessed. The search bar's bottom,
  // the tool column's left edge and the place card's top are what actually stand between
  // the user and the map, and all three move with the device, the locale and the card's
  // collapsed state. Deliberately a SEPARATE query from syncOverlayClearance: that one is
  // pinned by its own suite to the search selector and to a single overlayTop write, and
  // it must stay exactly that. This one writes nothing to `data` at all — the padding is
  // read at command time, so a measurement never costs a bridge write or a re-render.
  syncCameraPadding() {
    if(!this.active||this.disposed||!this.createSelectorQuery)return;
    const request=this.cameraPaddingRequest=(this.cameraPaddingRequest||0)+1;
    this.createSelectorQuery()
      .select('.map-tool-column').boundingClientRect(tool=>{
        this.createSelectorQuery().select('.place-card').boundingClientRect(card=>{
          if(!this.active||this.disposed||request!==this.cameraPaddingRequest)return;
          const next=this.cameraMeasurement=this.cameraMeasurement||{};
          if(tool&&Number.isFinite(tool.left))next.toolLeft=tool.left;
          if(card&&Number.isFinite(card.top))next.cardTop=card.top;
        }).exec();
      }).exec();
  },
  cameraViewport() {
    try {
      const win=wx.getWindowInfo?wx.getWindowInfo():(wx.getSystemInfoSync?wx.getSystemInfoSync():null);
      if(win&&Number.isFinite(win.windowWidth)&&win.windowWidth>0) {
        return {width:win.windowWidth, height:Number.isFinite(win.windowHeight)?win.windowHeight:0,
          safeBottom:win.safeArea?Math.max(0,(win.windowHeight||0)-win.safeArea.bottom):0};
      }
    } catch(e) { /* fall through to the shared metric */ }
    // No window info: there is no honest height to reserve against, so the caller is told
    // exactly that (height 0) instead of being handed an invented one.
    let width=0;
    try { width=metrics.getMetrics().screenWidth; } catch(e) { /* keep 0 */ }
    return {width:Number.isFinite(width)&&width>0?width:375, height:0, safeBottom:0};
  },
  // [top, right, bottom, left] in component pixels, from the last measurement. Falls back
  // to a documented mirror of the CSS contract until the first measurement lands, and
  // over-reserves rather than under-reserves while it does.
  cameraPadding() {
    const viewport=this.cameraViewport();
    const measured=this.cameraMeasurement;
    // overlayTop is the page's own measured safe line (search bottom + 8). onLoad seeds it
    // from the capsule metric, so it is a real device-derived value before the first
    // measurement ever lands; the bootstrap covers a page that has neither.
    const overlayTop=Number(this.data.overlayTop)>0?Number(this.data.overlayTop):(Number(this.data.headerTop)>0?Number(this.data.headerTop)+120:0);
    if(!measured||!(measured.toolLeft>0)||!(measured.cardTop>0)||!(overlayTop>0))return mapCamera.bootstrapPadding(viewport,overlayTop);
    return mapCamera.paddingFrom({viewport,searchBottom:overlayTop,toolLeft:measured.toolLeft,cardTop:measured.cardTop,gutter:0});
  },
  // The overview camera plan for the visible markers. Null when there is nothing
  // legitimate to fit — a 0-marker overview then issues NO camera command instead of
  // jumping somewhere arbitrary, which is the safe default the brief asks for.
  planOverview(visible) {
    const points=(visible||[]).map(m=>m.coordinates).filter(Boolean);
    if(!points.length)return null;
    return mapCamera.overview(points,this.cameraViewport(),this.cameraPadding(),this.data.mapScale);
  },
  initMarkerRenderer() {
    if(this.active && this.markerCanvas && !this.pinRenderer) {
      try {this.pinRenderer=mapMarkers.createRenderer(this.markerCanvas);} catch(e) { /* bundled fallback remains usable */ }
    }
  },
  onResize() { const m=metrics.getMetrics(true); this.setData({headerTop:m.headerTop,overlayTop:m.headerTop+120},()=>{this.syncOverlayClearance();this.syncCameraPadding();this.syncStackPositions();}); },
  onHide() {
    this.markerCanvasRequest=(this.markerCanvasRequest||0)+1;this.markerCanvasPending=false;
    this.onStackRelease();
    // A transition that is still running must not write a camera frame into a hidden page.
    this.cancelCameraTransition();
    this.stackGesture=false;clearTimeout(this.stackAlignTimer);this.stackAlignTimer=null;
    // A hidden page must not resolve a tap against a reply that arrives later.
    this.zoomReadRequest=(this.zoomReadRequest||0)+1;
    this.cameraPaddingRequest=(this.cameraPaddingRequest||0)+1;
    this.clearZoomCommand();
    this.stackProjectionBusy=false;
    this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    this.stopMarkerAnimation();
    this.stopDrawerReveal();
    this.clearOverlayMotionTimer();
    this.clearHybridHandoffTimer();
    this.cancelPendingMapAction();
    this.overlayMountRootId='';
    this.overlayClosingFast=false;
    this.overlayVisualOpen=false;
    this.hybridCalloutActive=false;
    this.hybridInkHidden=false;
    this.stopMarkerPhotoBatch();
    this.setData({clusterOpen:false,mapDrawers:[],stackPositionsReady:false,hybridCalloutRootId:''});
    this.deferredMapState=null;this.drawerResumeTarget=undefined;this.markerResumeNeeded=false;
    this.active=false;this.markerGeneration=(this.markerGeneration||0)+1;
    // A primary-tab switch is not an unload. The page instance, the <map> component, the WXML
    // node tree and the renderer canvas all survive it, so the composed marker photos must
    // survive with them: disposing here is what threw away every resolved photo and forced the
    // whole visible set to be downloaded and re-composed on the very next onShow. The renderer
    // is bounded by its own LIMIT of composed variants, and it is released in onUnload.
  },
  onUnload() {
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.disposed=true;this.onHide();
    // The renderer now outlives onHide, so its release belongs to the real end of the page.
    if(this.pinRenderer) this.pinRenderer.dispose();this.pinRenderer=null;
    if (this.unsubscribe) this.unsubscribe();
  },

  onShow() {
    try { const rect=wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) this.setData({menuButtonTop:rect.top,menuButtonHeight:rect.height,menuButtonBorderRadius:rect.height/2}); } catch(e){}

    const m=metrics.getMetrics(true); this.setData({headerTop:m.headerTop,overlayTop:m.headerTop+120,imageErrors:{}});
    this.active=true;this.initMarkerRenderer();
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(1, this._tabAppearance);
    this.mapCtx = wx.createMapContext('savor-map', this);
    this.syncState(state);
    this.readMapScale();
    // A tab may become visible while App.onShow is still verifying the account.
    // Join that verification rather than misreporting IDENTITY_LOCKED as a network failure.
    return this.syncMapCloud();
  },

  async syncMapCloud() {
    if (identity.isDiagnosisActive()) return; // An intentional freeze is not an outage.
    const session = identity.snapshot();
    const unsettled = session.locked || session.status === 'verifying';
    // Joining an in-flight verification is a fail-closed obligation and always runs. Reading the
    // product data again is not: the store subscription already carries every local change, so a
    // read only happens when this session has never synced, when queued work needs flushing, or
    // when the bounded refresh window has elapsed.
    if (!unsettled && !this.cloudSyncDue()) return;
    try {
      if (unsettled) await identity.verify();
      if (!this.active || this.disposed) return;
      await store.syncCloud();
      this.lastCloudSyncAt = Date.now();
    } catch (error) {
      if (!this.active || this.disposed || identity.isDiagnosisActive()) return;
      // A failed/changed identity is rendered by the identity gate, not a cache Toast.
      if (identity.snapshot().locked || ['IDENTITY_LOCKED', 'STALE_IDENTITY'].includes(error && error.code)) return;
      store.notify(i18n.t('地图正在显示缓存记录，云同步暂不可用。'));
    }
  },

  cloudSyncDue() {
    if (this.lastCloudSyncAt === undefined) return true;   // this page has never read the cloud
    if ((store.get().outbox || []).length) return true;    // queued work must be flushed
    return Date.now() - this.lastCloudSyncAt >= MAP_CLOUD_SYNC_INTERVAL_MS;
  },

  syncState(state) {
    // The image cache is per owner. A different owner must not inherit resolved URLs or
    // prepared derivatives, so the whole pipeline is dropped the moment the owner changes.
    const owner = state && state.identity ? state.identity.userId : '';
    if (this.imageCacheOwner !== owner) { this.imageCacheOwner = owner; imageCache.reset(); }
    i18n.syncPage(this, state, 1);
    // Identity appearance updates remain immediate; defer only map rendering during a pan.
    // Remember work, never retain a private account snapshot across a gesture.
    this.deferredMapState=null;
    if(this.stackGesture && !identity.snapshot().locked){this.deferredMapState=true;return;}
    // This page is published to by the store subscription, so the store's revision says whether
    // anything it renders has actually changed. An unchanged revision means the values below are
    // already on screen: re-deriving them and re-publishing them would be a bridge write that
    // changes nothing, and rebuilding the marker set would throw away the composed photos the
    // renderer still holds. A primary-tab switch publishes nothing, so this is the path a tab
    // return takes.
    const revision = store.revision();
    if (revision === this.renderedRevision) { this.resumeMapView(); return; }
    this.renderedRevision = revision;
    const isSample = m => !m.cloudId && data.initialMemories.some(seed => seed.id === m.id);
    const real = state.memories.filter(m => !isSample(m));
    this.pendingLocations = real.filter(m => !locations.confirmed(m) || !m.geoConfirmed);
    this.allMemories = real.length ? real.filter(locations.confirmed) : state.memories.filter(isSample);
    this.setData({ pendingCount: this.pendingLocations.length, demoMode: !real.length });
    this.setData({ dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion, showNativePoi: state.settings.showNativePoi !== false });
    this.applyFilters(this.data.query, this.data.filter, this.data.selectedId, 'preserve');
  },

  // Everything a page that became visible again genuinely has to redo, and nothing more.
  // The marker set, the drawers and the composed photos are already correct, so this only
  // restores what a hidden page could not keep running: the native-bounds measurement and the
  // overlay hit regions. Any photo the renderer already holds is rebound from its cache rather
  // than downloaded again, so a return with no data change performs no network work at all.
  resumeMapView() {
    if (!this.active || this.disposed) return;
    this.syncOverlayClearance();
    this.syncCameraPadding();
    this.syncStackPositions();
    this.renderMarkerPhotos((this.markerGroups||[]).map(g=>g.memory), this.data.selectedId, this.markerGeneration);
    this.renderDrawerPhotos(this.markerGeneration);
  },

  applyFilters(query, filter, preferredId, viewportMode) {
    const visible = visibleMemories(this.allMemories || [], query, filter);
    const selected = visible.find(function (m) { return m.id === preferredId; })
      || visible.find(function (m) { return m.id === 'comptoir'; })
      || visible[0]
      || null;
    this.stopMarkerAnimation();
    const groups=mapLayout.group(visible,this.data.mapScale,(this.data.clusterOpen||this.drawerProgress>0)?this.drawerRootId:selected && selected.id);
    const overlayMode=this.drawerOverlayMode();
    this.markerGroups=groups;
    if(this.data.clusterOpen&&!groups.some(g=>g.memory.id===this.drawerRootId&&g.members.length>1))this.setData(this.dismissOverlayDrawer({}));
    const representatives=groups.map(g=>g.memory);
    const previous=this.data.markers || [];
    const animation=[];
    const markers = representatives.map((memory, index) => {
      const isSelected = Boolean(selected && memory.id === selected.id);
      const groupCount = groups[index].members.length;
      const badgeCount = overlayMode && groupCount > 1 ? groupCount : 1;
      const old=previous.find(m=>m.memoryId===memory.id);
      const target=mapMarkers.style(isSelected);
      if(groupCount>1){target.width=80;target.height=90;}
      const cached=this.pinRenderer && this.pinRenderer.peek && this.pinRenderer.peek(memory,isSelected,badgeCount);
      if(cached) target.iconPath=cached;
      else if(old && old.groupCount===groupCount && old.stampSelected===isSelected) target.iconPath=old.iconPath;
      // A stack anchor is transparent and 1px wide; it is never a singleton image/size.
      const from=old&&old.groupCount===1?old.width:48;
      if(groupCount===1 && this.active && !this.data.quiet && Math.abs(from-target.width)>.1) {animation.push({index,from,to:target.width});target.width=from;target.height=from*286/256;}
      if(groupCount>1){
        if(overlayMode){
          // The native marker bitmap now carries the cluster count badge directly at 60fps.
          // Keep {x:0.5,y:1} anchor so the on-demand overlay frame aligns when opened.
          target.width=80;target.height=89;target.anchor={x:0.5,y:1};
          target.iconPath=cached||(old && old.groupCount===groupCount && old.stampSelected===isSelected ? old.iconPath : mapMarkers.style(isSelected).iconPath);
        } else {
          // Legacy: a transparent 1px anchor; the native callout draws the entire stack.
          target.width=1;target.height=1;target.iconPath='/images/markers/stack-anchor.png';target.anchor={x:0.5,y:1};
        }
      }
      target.width=Math.max(1,Math.round(Number(target.width)||48));
      target.height=Math.max(1,Math.round(Number(target.height)||54));
      return Object.assign({
        stampSelected:isSelected, groupCount:groups[index].members.length,
        label:undefined,
        // In native-callout mode every cluster mounts a callout. In view-overlay mode
        // collapsed clusters mount zero callouts, and only a single settled open cluster
        // carries a static native callout so dragging keeps it anchored at 60fps.
        customCallout:(groups[index].members.length>1&&!overlayMode)
          ? {display:'ALWAYS',anchorX:0,anchorY:0}
          : ((groups[index].members.length>1&&overlayMode&&this.hybridCalloutActive&&this.data.clusterOpen&&memory.id===this.drawerRootId&&old&&old.customCallout)
            ? Object.assign({},old.customCallout)
            : undefined),
        id: index,
        memoryId: memory.id,
        latitude: memory.coordinates[0],
        longitude: memory.coordinates[1],
        // D: shop names live in the detail card / collapsed strip, never on the map.
      }, target);
    });
    this.visibleIds = representatives.map(function (m) { return m.id; });
    const generation=this.markerGeneration=(this.markerGeneration||0)+1;
    const distanceLabel = selected ? (selected.address || selected.neighborhood || (this.data.demoMode ? i18n.t('Sample location') : '已确认餐馆位置')) : '';
    const shouldFocus = selected && (viewportMode !== 'preserve' || !this.data.selected || this.data.selected.id !== selected.id || this.data.selected.coordinates[0] !== selected.coordinates[0] || this.data.selected.coordinates[1] !== selected.coordinates[1]);
    const patch = {
      selectedId: selected ? selected.id : '',
      markers: markers,
      mapDrawers:this.buildDrawers(groups,markers,selected && selected.id),
      resultsCount: query ? visible.length : 0,
      emptyState: visible.length ? null : emptyMapState(query, filter, this.data.pendingCount),
      selected: selected ? Object.assign({}, selected, { dateLabel: data.formatDate(selected.date),categoryLabel:restaurantCategory.summary(selected)||i18n.t('Category not recorded') }) : null,
      selectedPhoto: selected ? (selected.placePhoto || selected.photo || data.photos.meal) : '',
      selectedSaved: Boolean(selected && selected.saved),
      distanceLabel: distanceLabel,
    };
    // Dev-only, off by default: record what the selected Memory really holds so a grey marker
    // can be attributed to the record instead of guessed at. Guarded so a harness that stubs
    // mapMarkers (and therefore has no .photoTrace) simply skips it.
    if (selected && mapMarkers.photoTrace) {
      const own = (groups || []).find(g => g.memory.id === selected.id);
      mapMarkers.photoTrace.memorySnapshot(selected, {
        mapScale: this.data.mapScale,
        groupCount: own ? own.members.length : 1,
        defaultMeal: data.photos.meal,
      });
    }
    // The bound props ARE a camera channel, and on a real device that channel is INSTANT:
    // writing latitude/longitude moves the native camera in the same frame (measured —
    // 161 samples over 900ms, one distinct centre). Writing them in the same patch as the
    // selection therefore teleported the map BEFORE any camera command could run, and that
    // is exactly what made a marker tap read as a jump cut.
    //
    // A marker focus is now a TRAVEL, not a write: focusMapCamera() below drives a short
    // sequence of centre writes behind an explicit transition token. So no camera prop is
    // written here at all — the selection patch carries selection state only. The overview
    // is the one case that still writes the props directly, because on the IDE the bound
    // props are the only channel that can express a chosen fit level.
    const overviewPlan = viewportMode === 'overview' ? this.planOverview(visible) : null;
    // The overview's plan is unchanged — same fit geometry, same measured padding, same chosen
    // level. Only the way it is APPLIED changed: the centre TRAVELS through the same token as a
    // marker focus instead of being written in one frame. It used to be the last instant centre
    // jump left in the Map, and "detail -> overview" is supposed to be the mirror of
    // "overview -> detail", not a cut.
    // The card is a preview surface. When the preview is ALREADY cached — the normal case, since
    // the visible set is warmed after every camera settle — it is bound in the same patch as the
    // selection, so the card paints it immediately and the cloud original is never requested.
    // When it is not cached the original stands as the placeholder and the preview replaces it,
    // which is strictly better than an empty card while a 10 MB original arrives.
    const cardSource = selected ? (selected.placePhoto || selected.photo || data.photos.meal) : '';
    const cardPreview = selected && data.isCloudImage(cardSource) ? imageCache.cachedLocal(cardSource, 'preview', selected.revision) : null;
    if (cardPreview) patch.selectedPhoto = cardPreview;
    // Wait for the marker/card update before issuing one camera command.
    // A native pan need not update data.latitude: explicit focus also handles
    // tapping the same marker again after panning away.
    this.setData(patch, () => {
      this.ensureMarkerRenderer();
      this.syncOverlayClearance();
      this.syncCameraPadding();
      this.syncStackPositions();
      this.animateMarkerSizes(animation,generation);
      this.renderMarkerPhotos(representatives, selected && selected.id, generation);
      this.renderDrawerPhotos(generation);
      // Image preparation is raised BEFORE and ALONGSIDE the camera work, never after it: the
      // card's preview must be on its way the moment the selection happens, not when the travel
      // finishes. (The marker side is the renderer's own queue.)
      this.resolveCardPreview(selected, generation);
      if (overviewPlan) {
        // One travel, carrying the plan's own centre and level. `includePoints` is deliberately
        // no longer used here: it sets the centre AND the scale in one imperative jump, which is
        // exactly the cut this round removes. The geometry module already computes the level the
        // fit would have chosen, so nothing about the plan is lost.
        const centre = mapCamera.centreForPoint(overviewPlan.centre, overviewPlan.level, this.cameraViewport(), overviewPlan.padding);
        this.cancelCameraTransition();
        // Written only when it changes something: re-writing the same level re-dispatches the
        // bound prop and restarts the platform's own zoom easing for no reason.
        const observed = Number.isFinite(this.data.mapScale) ? this.data.mapScale : overviewPlan.level;
        if (Math.abs(overviewPlan.level - observed) >= 0.5) this.setData({ commandScale: overviewPlan.level });
        this.startCameraTransition(centre);
        return;
      }
      if (shouldFocus) this.focusMapCamera(selected.coordinates);
    });
  },

  // A marker focus is a short, interruptible TRAVEL from wherever the camera actually is
  // to the selected marker, composed into the unobstructed region. It is deliberately not
  // a native command: the platform offers no camera animation API, `moveToLocation` is a
  // centre-only jump and is unavailable on the IDE, and `includePoints` is a silent no-op
  // there. The bound centre props, however, are followed write by write (measured: 30
  // writes 20 ms apart -> 26 distinct native centres along a monotone path), so a
  // sequence of ordinary writes IS a continuous pan on every platform.
  //
  // Nothing here queues: a second tap cancels the running travel and re-seeds from the
  // CURRENT position, so the last intent always wins and the camera never finishes an
  // abandoned journey first.
  withFreshCameraCentre(fn) {
    if (!this.cameraCentreStale || !this.mapCtx || !this.mapCtx.getRegion) { fn(); return; }
    const req = this.cameraCentreSyncRequest = (this.cameraCentreSyncRequest || 0) + 1;
    const run = () => {
      if (req !== this.cameraCentreSyncRequest || !this.active || this.disposed || this.stackGesture) return;
      fn();
    };
    this.mapCtx.getRegion({
      success: region => {
        const ne = region && region.northeast, sw = region && region.southwest;
        if (ne && sw && Number.isFinite(ne.latitude) && Number.isFinite(sw.latitude) && Number.isFinite(ne.longitude) && Number.isFinite(sw.longitude)) {
          this.cameraLiveCentre = [(ne.latitude + sw.latitude) / 2, (ne.longitude + sw.longitude) / 2];
          this.cameraCentreStale = false;
        }
        run();
      },
      fail: () => { this.cameraCentreStale = false; run(); },
    });
  },
  clusterDrawerHeight(group) {
    const others = Math.max(1, (group && group.members ? group.members.length : 2) - 1);
    const pages = Math.ceil(others / 3);
    const bounds = mapStack.layout(Math.min(3, others), 1);
    const reserve = pages > 1 ? 28 : 0;
    const viewport = this.cameraViewport();
    const buttonBox = mapStack.buttonGeometry(viewport.width || metrics.getMetrics().screenWidth, pages === 1);
    return bounds.height + reserve - Math.min(0, buttonBox.hitTop);
  },
  clusterFocusCentre(group) {
    const scale = Number.isFinite(this.data.mapScale) ? this.data.mapScale : 13;
    const viewport = this.cameraViewport();
    const padding = this.cameraPadding();
    if (mapCamera.centreForCluster) {
      return mapCamera.centreForCluster(group.memory.coordinates, scale, viewport, padding, this.clusterDrawerHeight(group));
    }
    return mapCamera.centreForPoint(group.memory.coordinates, scale, viewport, padding);
  },
  focusMapCamera(coordinates) {
    this.withFreshCameraCentre(() => {
      const scale = Number.isFinite(this.data.mapScale) ? this.data.mapScale : 13;
      const viewport = this.cameraViewport();
      const padding = this.cameraPadding();
      const target = mapCamera.centreForPoint(coordinates, scale, viewport, padding);
      this.startCameraTransition(target);
    });
  },

  // ---- programmatic camera transition -------------------------------------------------
  // The token every write of this transition is guarded by. While it is live, the page's
  // regionchange handler must do NO derived work: each centre write raises regionchange
  // (measured at 2 begin/end pairs per write), and rebuilding projections / re-reading the
  // scale / regrouping markers per frame is exactly the bridge flood this exists to avoid.
  // A user gesture always outranks it.
  cameraCentre() {
    const live = this.cameraLiveCentre;
    if (live && Number.isFinite(live[0]) && Number.isFinite(live[1])) return [live[0], live[1]];
    const lat = Number(this.data.latitude), lng = Number(this.data.longitude);
    return [Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0];
  },
  startCameraTransition(target) {
    this.cancelCameraTransition();
    const from = this.cameraCentre();
    const scale = Number.isFinite(this.data.mapScale) ? this.data.mapScale : 13;
    const distance = mapCamera.panPixels(from, target, scale);
    const duration = mapCamera.panDurationMs(distance);
    const transition = this.cameraTransition = {
      token: (this.cameraTransitionSerial || 0) + 1,
      from, to: [target[0], target[1]],
      // The geometry the target was composed for. Carried on the transition so the contract
      // "it lands on the composed centre" stays checkable without recomputing it.
      scale, viewport: this.cameraViewport(), padding: this.cameraPadding(),
      duration, startedAt: Date.now(), frame: 0, timer: null,
    };
    this.cameraTransitionSerial = transition.token;
    // The projected drawer ink lives in page coordinates, so a moving camera would leave it
    // behind. Exactly like a user gesture, the hit regions go away for the duration and are
    // re-projected once, when the camera settles.
    if (this.data.stackPositionsReady) this.setData({ stackPositionsReady: false });
    this.stepCameraTransition(0);
  },
  // Drives the transition to `elapsed` ms. Exposed as a plain method so the contract can be
  // exercised without a timer: the frame loop is only a scheduler around this.
  stepCameraTransition(elapsed) {
    const transition = this.cameraTransition;
    if (!transition || transition.token !== this.cameraTransitionSerial) return;
    if (this.disposed || !this.active) { this.cancelCameraTransition(); return; }
    const progress = transition.duration > 0 ? Number(elapsed) / transition.duration : 1;
    const point = mapCamera.panPoint(transition.from, transition.to, progress);
    transition.frame += 1;
    this.cameraLiveCentre = point;
    // The first sample is the point the camera is ALREADY at. Writing it would only
    // re-dispatch the bound props, so the travel starts on the first real movement.
    if (progress > 0) this.setData({ latitude: point[0], longitude: point[1] });
    if (progress >= 1) { this.finishCameraTransition(transition); return; }
    this.scheduleCameraFrame(transition);
  },
  scheduleCameraFrame(transition) {
    // Absolute deadlines, never "16 ms after the last acknowledgement": a late frame must
    // not add its own drift on top of the delay (same rule as the drawer reveal).
    const due = transition.startedAt + transition.frame * (1000 / 60);
    const delay = Math.max(0, due - Date.now());
    transition.timer = setTimeout(() => {
      transition.timer = null;
      this.stepCameraTransition(Date.now() - transition.startedAt);
    }, delay);
  },
  finishCameraTransition(transition) {
    if (transition.timer) { clearTimeout(transition.timer); transition.timer = null; }
    this.cameraTransition = null;
    this.cameraLiveCentre = transition.to;
    this.cameraCentreStale = false;
    // One reconciliation, after the camera has settled — never per frame. This reuses the
    // existing imperative-command path: it re-projects the hit regions, re-reads the real
    // scale, adopts the real centre as the anchor and regroups only if the grouping changed.
    this.onCameraViewportReady(this.markerGeneration, 'focus');
  },
  // Raise the selected card's PREVIEW. It runs in parallel with the camera travel, and it is
  // bound only if it is still the right selection when it lands — a stale preview must never
  // paint over a newer card.
  resolveCardPreview(selected, generation) {
    if (!selected) return;
    const source = selected.placePhoto || selected.photo || data.photos.meal;
    if (!data.isCloudImage(source)) return;                 // package art and local paths are already final
    if (imageCache.cachedLocal(source, 'preview', selected.revision)) return;  // already bound in the patch
    imageCache.ensureLocal(source, 'preview', CARD_PREVIEW_LONG_EDGE, { revision: selected.revision })
      .then(path => {
        if (!path || this.disposed || generation !== this.markerGeneration) return;
        if (this.data.selectedId !== selected.id) return;
        if (path === this.data.selectedPhoto) return;
        this.setData({ selectedPhoto: path });
      })
      .catch(() => { /* the card keeps the original binding it already has */ });
  },
  // After the camera settles, warm the SELECTED marker variant of everything on screen. The
  // bytes are shared with the normal variants, so this buys the next tap a ready icon for the
  // cost of one local compose per marker — and it never competes with a real tap, which is
  // queued at the renderer's own high priority.
  prefetchVisibleSelection() {
    const groups = this.markerGroups || [];
    if (this.pinRenderer && this.pinRenderer.prefetchSelected) {
      const overlayMode = this.drawerOverlayMode();
      this.pinRenderer.prefetchSelected(
        groups.map(group => group.memory),
        this.data.selectedId,
        groups.map(group => (overlayMode && group.members.length > 1 ? group.members.length : 1))
      );
    }
    // P2, the other half of the same prediction: the selected-card PREVIEW of every marker the
    // user can see. It is serialized inside the image pipeline, so this can never compete with
    // the image the user just asked for — and a tap then paints its card in the same frame
    // instead of waiting for a cloud original.
    groups.forEach(group => {
      const memory = group.memory;
      if (!memory || memory.id === this.data.selectedId) return;
      const source = memory.placePhoto || memory.photo;
      if (!source || !data.isCloudImage(source)) return;
      imageCache.ensureLocal(source, 'preview', CARD_PREVIEW_LONG_EDGE, { revision: memory.revision }).catch(() => {});
    });
  },
  cancelCameraTransition() {
    const transition = this.cameraTransition;
    if (!transition) return;
    if (transition.timer) clearTimeout(transition.timer);
    this.cameraTransition = null;
    // Whatever the camera reached is the truth from now on: a following transition re-seeds
    // from here instead of from the abandoned target.
    this.cameraLiveCentre = this.cameraLiveCentre || transition.from;
  },
  cameraFitLocal() {
    // Whether an imperative viewport fit can be trusted; when it cannot, the
    // fit is expressed through the bound props already driving the map.
    if (this.cameraMoveUnavailable) return true;
    try {
      const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
      return info.platform === 'devtools';
    } catch (e) { return false; }
  },
  onCameraViewportReady(generation, reason) {
    if (!this.active || this.disposed || generation !== this.markerGeneration || this.stackGesture) return;
    // Imperative native camera calls may not emit regionchange (notably IDE).
    // Never let an earlier getRegion reply re-enable hit regions for the old view.
    this.stackPositionRequest = (this.stackPositionRequest || 0) + 1;
    this.stackProjectionBusy = false;
    if (this.data.stackPositionsReady) this.setData({stackPositionsReady:false});
    const pendingOpen = reason === 'focus' && this.pendingMapAction && this.pendingMapAction.type === 'cluster-open'
      ? this.pendingMapAction : null;
    if (pendingOpen) {
      this.pendingMapAction = null;
      const openIndex = (this.markerGroups || []).findIndex(g => g.memory.id === pendingOpen.rootId && g.members.length > 1);
      if (openIndex >= 0) {
        this.cameraClusterOpenSettledAt = Date.now();
        this.prepareClusterOpenForProjection(openIndex);
      }
    }
    // A fit or a focus moves the native centre without moving the bound props, and the
    // scale reply below re-asserts them: track the anchor to that same native viewport
    // first, or applying the new scale silently pulls the view back to the previous
    // centre. This now covers BOTH imperative commands — a focus is exactly as
    // imperative as an overview, and on a device it is the only thing that moved the
    // camera at all. 单点聚焦与原生定位各自保留显式目标，不参与对齐。
    // 顺序保持既有可观察时序（本帧内同步刷新缩放与投影），锚点仅追加一次只读对齐。
    // 只对齐一次：由下面 syncStackPositions 已发起的那次 getRegion 回复消费，
    // 不额外查询、不新增定时器、不下发新的相机指令。
    this.cameraAnchorPending = pendingOpen ? false : (reason === 'overview' || reason === 'focus');
    this.prefetchVisibleSelection();
    this.rebindReadyMarkerPhotos();
    this.readMapScale();
    this.syncStackPositions();
  },

  // Project overlay hit/drawer coordinates on demand once the native camera has settled.
  // In view-overlay mode collapsed clusters carry their count badge natively on the marker
  // bitmap, so pure pans perform zero getRegion IPC and mount zero overlay nodes.
  syncStackPositions() {
    if(!this.active||this.stackGesture||!this.mapCtx||!this.mapCtx.getRegion){this.cameraAnchorPending=false;return;}
    const overlayMode=this.drawerOverlayMode();
    const needsOverlay=!overlayMode||Boolean(this.data.clusterOpen)||Boolean(this.drawerProgress>0)||Boolean(this.overlayMountRootId);
    if(!needsOverlay&&!this.cameraAnchorPending){
      if(this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
      return;
    }
    if(this.stackProjectionBusy){this.cameraAnchorPending=false;return;}
    this.stackProjectionBusy=true;
    const request=this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    const finish=()=>{if(request===this.stackPositionRequest)this.stackProjectionBusy=false;};
    this.mapCtx.getRegion({success:region=>{
      if(!this.active||this.disposed||request!==this.stackPositionRequest){finish();return;}
      // The real native centre, captured for free. A later camera transition must start from
      // where the camera ACTUALLY is — after a user pan the bound props are stale, and a
      // travel seeded from them would jump on its first frame.
      const ne0=region&&region.northeast,sw0=region&&region.southwest;
      if(ne0&&sw0&&Number.isFinite(ne0.latitude)&&Number.isFinite(sw0.latitude)&&Number.isFinite(ne0.longitude)&&Number.isFinite(sw0.longitude)){this.cameraLiveCentre=[(ne0.latitude+sw0.latitude)/2,(ne0.longitude+sw0.longitude)/2];this.cameraCentreStale=false;}
      const stillNeedsOverlay=!this.drawerOverlayMode()||Boolean(this.data.clusterOpen)||Boolean(this.drawerProgress>0)||Boolean(this.overlayMountRootId);
      if(!stillNeedsOverlay){
        const anchor={};
        if(this.cameraAnchorPending){
          this.cameraAnchorPending=false;
          if(ne0&&sw0){
            const latitude=(ne0.latitude+sw0.latitude)/2,longitude=(ne0.longitude+sw0.longitude)/2;
            if(Math.abs(latitude-this.data.latitude)>1e-7||Math.abs(longitude-this.data.longitude)>1e-7){anchor.latitude=latitude;anchor.longitude=longitude;}
          }
        }
        if(this.data.stackPositionsReady)anchor.stackPositionsReady=false;
        if(Object.keys(anchor).length)this.setData(anchor);
        finish();
        return;
      }
      this.createSelectorQuery().select('#savor-map').boundingClientRect(rect=>{
        if(!rect||!this.active||this.disposed||request!==this.stackPositionRequest){finish();return;}
        const positions={};
        (this.markerGroups||[]).forEach(g=>{
          const point=mapProjection.project(g.memory.coordinates,region,rect);
          if(point)positions[g.memory.id]=point;
        });
        this.stackPositions=positions;
        // An imperative overview moves the native view but leaves the bound anchor
        // on the previous centre; adopting the centre of this same reply keeps the
        // fit instead of re-asserting it, and costs no extra query.
        const anchor={};
        if(this.cameraAnchorPending){
          this.cameraAnchorPending=false;
          const ne=region&&region.northeast,sw=region&&region.southwest;
          if(ne&&sw){
            const latitude=(ne.latitude+sw.latitude)/2,longitude=(ne.longitude+sw.longitude)/2;
            if(Math.abs(latitude-this.data.latitude)>1e-7||Math.abs(longitude-this.data.longitude)>1e-7){anchor.latitude=latitude;anchor.longitude=longitude;}
          }
        }
        const mapDrawers=this.buildDrawers(this.markerGroups||[],this.data.markers,this.data.selectedId);
        const readyPatch=Object.assign({stackPositionsReady:Object.keys(positions).length>0,mapDrawers},anchor);
        mapDrawers.forEach(d=>{
          const marker=(this.data.markers||[])[d.markerId];
          const expectedAnchorY=d.overlayMode?d.calloutOffset+mapStack.HEIGHT:d.calloutOffset;
          if((!d.overlayMode||d.hybridCallout)&&marker&&marker.customCallout&&marker.customCallout.anchorY!==expectedAnchorY)readyPatch['markers['+d.markerId+'].customCallout.anchorY']=expectedAnchorY;
        });
        const pendingRoot=this.drawerOverlayMode()&&this.data.clusterOpen&&this.overlayMountRootId===this.drawerRootId&&!this.overlayVisualOpen?this.drawerRootId:'';
        const quietHandoffRoot=this.drawerOverlayMode()&&this.data.clusterOpen&&this.overlayMountRootId===this.drawerRootId&&this.overlayVisualOpen&&!this.hybridCalloutActive?this.drawerRootId:'';
        this.setData(readyPatch,()=>{
          if(!this.active||this.disposed||this.stackGesture)return;
          if(pendingRoot)this.scheduleOverlayOpenFlip(pendingRoot);
          else if(quietHandoffRoot)this.scheduleHybridHandoff(quietHandoffRoot,32);
          this.renderDrawerPhotos(this.markerGeneration);
        });
        finish();
      }).exec();
    },fail:finish});
  },
  // Where the animated drawer ink lives. Read from one place so the geometry, the driver
  // choice and the markup can never disagree about which renderer is active.
  drawerOverlayMode() { return this.data.drawerRenderMode === 'view-overlay'; },
  // Does a CSS transform supply the motion, or the JS frame loop? view-overlay has no native
  // callout left to frame-patch, so it always drives with a transform.
  drawerTransformDriver() { return Boolean(this.data.drawerCssMotion) || this.drawerOverlayMode(); },
  buildDrawers(groups,markers,selectedId) {
    const windowWidth=metrics.getMetrics().screenWidth;
    const overlayMode=this.drawerOverlayMode();
    // Either transform driver lays the drawer out at its FULLY OPEN geometry and lets the
    // end state pick the pixels: the CSS transition inside the callout, or the ordinary
    // overlay. Only the JS frame loop still rebuilds geometry per frame.
    const staticFrame=Boolean(this.data.drawerCssMotion)||overlayMode;
    return groups.map((g,index)=>{
      if(g.members.length<2)return null;
      const logicalOpen=this.data.clusterOpen&&g.memory.id===this.drawerRootId;
      const overlayMounted=!overlayMode||g.memory.id===this.overlayMountRootId||logicalOpen;
      const targetOpen=(overlayMode&&this.overlayMountRootId===g.memory.id)?Boolean(this.overlayVisualOpen):logicalOpen;
      const progress=g.memory.id===this.drawerRootId?this.drawerProgress||0:0;
      const open=staticFrame?true:(targetOpen||progress>0);
      const others=g.members.filter(m=>m.id!==g.memory.id),pages=Math.ceil(others.length/3);
      const page=Math.max(0,Math.min(this.data.drawerPage||0,pages-1));
      let buttonBox=mapStack.buttonGeometry(windowWidth,pages===1);
      // Keep native callout bounds fixed while the logical 320ms frame moves.
      // Full page capacity also prevents the shorter last page moving the root.
      const bounds=mapStack.layout(Math.min(3,others.length),1),reserve=pages>1?28:0;
      let frameHeight=bounds.height+reserve,frameRootTop=bounds.rootTop+reserve;
      const members=others.slice(page*3,page*3+3);
      const pos=(this.stackPositions||{})[g.memory.id]||{x:0,y:0};
      // Choose from full capacity before opening; neither animation nor last-page length flips it.
      const down=Boolean(this.stackPositions&&this.stackPositions[g.memory.id]&&pos.y-frameHeight+buttonBox.hitTop<this.data.overlayTop);
      // Mirroring a paged hit box with hitTop=-4 extends its far edge by 4px.
      // Reserve that once in the fixed native frame; root compensation stays exact.
      if(down){const padding=Math.max(0,-buttonBox.hitTop);frameHeight+=padding;frameRootTop+=padding;}
      const baseButtonTop=buttonBox.top;
      // Absolute geometry inside the callout for ONE progress value. Both drivers are
      // measured against the same numbers, so a CSS transition ends on exactly the
      // pixels the JS frame loop used to reach, and the difference is all it has to move.
      const at=p=>{
        const f=mapStack.layout(members.length,p);
        if(pages>1){const extra=Math.round(28*p);f.height+=extra;f.rootTop+=extra;f.slots.forEach(slot=>{slot.top+=extra;});}
        const rowTops=members.map((m,j)=>{const slot=f.slots[j];return down?(2*f.rootTop-slot.top)-f.rootTop:(frameHeight-f.height+slot.top);});
        return {frame:f,rowTops,
          toggleTop:down?(f.rootTop+mapStack.HEIGHT-buttonBox.size-baseButtonTop):(frameHeight-f.height+baseButtonTop)};
      };
      const openAt=at(1),closedAt=staticFrame?at(0):openAt;
      const frame=staticFrame?openAt.frame:mapStack.layout(open?members.length:0,progress);
      if(!staticFrame&&pages>1){const extra=Math.round(28*progress);frame.height+=extra;frame.rootTop+=extra;frame.slots.forEach(slot=>{slot.top+=extra;});}
      const photo=m=>{
        const selected=m.id===selectedId;
        return {id:m.id,selected,iconPath:this.pinRenderer&&this.pinRenderer.peek&&this.pinRenderer.peek(m,selected)||mapMarkers.style(selected).iconPath};
      };
      buttonBox=mapStack.orient(frame,buttonBox,down);
      // rows[i] is members[members.length-1-i], so each row carries its own closed-state
      // offset and a regrouped index can never inherit another row's motion.
      const rows=open?members.map((m,j)=>Object.assign(photo(m),frame.slots[j],{layer:members.length-j,shiftY:closedAt.rowTops[j]-openAt.rowTops[j],opacity:staticFrame?(targetOpen?1:0):frame.slots[j].opacity})).reverse():[];
      // The ordinary overlay needs its own frame. In view-overlay mode the container is the
      // FIXED native frame sitting at the callout's own anchor, so left/top never animate and
      // only the children transform. Those children then read the very expressions the two
      // callout branches use, which is what makes the two renderers land on identical pixels.
      // In native-callout mode the container stays exactly what it always was.
      const pageInner=frameHeight-frame.height+36;
      const overlayTop=overlayMode?(down?pos.y-mapStack.HEIGHT:pos.y-frameHeight):pos.y-frame.height;
      const overlayHeight=overlayMode?frameHeight:frame.height;
      const overlayRootTop=overlayMode?(down?0:frameRootTop):frame.rootTop;
      // The overlay puts the VISUAL button inside the touch box, so the wrapper carries the
      // box's own offset and the glyph carries the difference. Reading buttonBox.top here as
      // well would count that difference twice and drop the button by it (8px when the stack
      // is single-page and opens upward).
      const overlayToggleTop=overlayMode?(down?buttonBox.hitTop-frame.rootTop:frameHeight-frame.height+buttonBox.hitTop):buttonBox.hitTop;
      const overlayPageTop=overlayMode?(down?(2*frame.height-frameHeight-72-30*progress)+pageInner:pageInner):(down?frame.rootTop+frame.height-36-30*progress:36);
      const calloutRowTop=row=>overlayMode?(down?row.top-frame.rootTop:frameHeight-frame.height+row.top):row.top;
      // The original native-callout button asset, transcribed branch for branch from the two
      // WXML arms. They are deliberately NOT the same condition: an upward drawer shows the
      // DOWN chevron once it is open, while a downward drawer shows it while it is closed.
      // Both renderers read this one value so they can never drift apart.
      const showDownChevron=down?!targetOpen:targetOpen;
      const buttonAsset=suffix=>'/images/markers/stack-button-'+(showDownChevron?'down':'up')+suffix+'.png';
      return {down,calloutOffset:down?frameHeight-mapStack.HEIGHT:0,frameHeight,frameRootTop,buttonBox,progress,screenX:pos.x-44,screenY:pos.y,markerId:index,rootId:g.memory.id,root:photo(g.memory),rootTop:frame.rootTop,height:frame.height,open,
        // Under the JS driver `open` is true while a closing drawer is still fading, so the
        // paging strip stays mounted through that fade. A transform driver has no fade of its
        // own to preserve, and mounting a strip in every closed cluster would add views to the
        // very layer being measured, so it follows targetOpen instead.
        stripOpen:staticFrame?targetOpen:open,
        overlayMode,overlayMounted,
        hybridCallout:Boolean(overlayMode&&this.hybridCalloutActive&&this.data.clusterOpen&&g.memory.id===this.drawerRootId),
        hybridInkHidden:Boolean(overlayMode&&this.hybridInkHidden&&g.memory.id===this.drawerRootId),
        fastMotion:Boolean(overlayMode&&this.overlayClosingFast&&g.memory.id===this.overlayMountRootId),transformDriver:staticFrame,overlayTop,overlayHeight,overlayRootTop,overlayToggleTop,overlayPageTop,
        // The visible toggle is a 32px glyph inside a 44px target, so it owns its own tap
        // instead of leaving a second transparent hit box behind it.
        toggleGlyphLeft:buttonBox.left-buttonBox.hitLeft,toggleGlyphTop:buttonBox.top-buttonBox.hitTop,
        toggleAsset:buttonAsset(''),toggleAssetDusk:buttonAsset('-dusk'),
        pageLabel:(page+1)+'/'+pages,
        targetOpen,rows:rows.map(row=>Object.assign({},row,{overlayRowTop:calloutRowTop(row)})),count:g.members.length,page,pages,toggleShiftY:closedAt.toggleTop-openAt.toggleTop};
    }).filter(Boolean);
  },
  renderDrawerPhotos(generation) {
    if(!this.pinRenderer||!this.active||this.stackGesture)return;
    const renderer=this.pinRenderer,tasks=[];
    // In view-overlay mode the cluster root is drawn by the native marker, and collapsed
    // drawers stay unmounted, so only an open drawer needs row photos.
    const overlayMode=this.drawerOverlayMode();
    if(overlayMode&&!this.data.clusterOpen&&!(this.drawerProgress>0))return;
    this.data.mapDrawers.forEach(drawer=>(overlayMode?[]:[drawer.root]).concat((drawer.targetOpen||(overlayMode&&drawer.overlayMounted&&this.data.clusterOpen))?drawer.rows:[]).forEach(pin=>{
      const memory=(this.allMemories||[]).find(m=>m.id===pin.id);if(!memory)return;
      const cached=renderer.peek&&renderer.peek(memory,pin.selected);
      if(cached===pin.iconPath)return;
      tasks.push(renderer.render(memory,pin.selected).then(path=>({rootId:drawer.rootId,id:pin.id,selected:pin.selected,path})).catch(()=>null));
    }));
    if(!tasks.length)return;
    Promise.all(tasks).then(results=>{
      if(this.disposed||!this.active||this.stackGesture||generation!==this.markerGeneration||renderer!==this.pinRenderer)return;
      const patch={};
      results.filter(Boolean).forEach(result=>{
        const i=this.data.mapDrawers.findIndex(d=>d.rootId===result.rootId);if(i<0)return;
        const d=this.data.mapDrawers[i],base='mapDrawers['+i+']';
        if(d.root.id===result.id&&d.root.selected===result.selected&&d.root.iconPath!==result.path)patch[base+'.root.iconPath']=result.path;
        d.rows.forEach((r,j)=>{if(r.id===result.id&&r.selected===result.selected&&r.iconPath!==result.path)patch[base+'.rows['+j+'].iconPath']=result.path;});
      });
      if(Object.keys(patch).length)this.setData(patch);
    });
  },
  refreshStackFrame(done) {
    const mapDrawers=this.buildDrawers(this.markerGroups||[],this.data.markers,this.data.selectedId),patch={mapDrawers};
    mapDrawers.forEach(d=>{
      const marker=(this.data.markers||[])[d.markerId];
      const expectedAnchorY=d.overlayMode?d.calloutOffset+mapStack.HEIGHT:d.calloutOffset;
      if((!d.overlayMode||d.hybridCallout)&&marker&&marker.customCallout&&marker.customCallout.anchorY!==expectedAnchorY)patch['markers['+d.markerId+'].customCallout.anchorY']=expectedAnchorY;
    });
    this.setData(patch,done);
  },
  patchDrawerFrame(progress,done) {
    const index=this.data.mapDrawers.findIndex(d=>d.rootId===this.drawerRootId);
    if(index<0){if(done)done();return;}
    const d=this.data.mapDrawers[index],frame=mapStack.layout(d.rows.length,progress);
    if(d.pages>1){const extra=Math.round(28*progress);frame.height+=extra;frame.rootTop+=extra;frame.slots.forEach(slot=>slot.top+=extra);}
    const base='mapDrawers['+index+']',patch={};
    const set=(key,value)=>{patch[base+'.'+key]=value;};
    set('progress',progress);set('height',frame.height);set('rootTop',frame.rootTop);
    if(d.down){const button=mapStack.orient(frame,d.buttonBox,true);set('buttonBox.top',button.top);set('buttonBox.hitTop',button.hitTop);}
    // Rows are in reverse paint order. Keep images/keys mounted throughout both directions.
    d.rows.forEach((row,i)=>{const slot=frame.slots[d.rows.length-1-i];set('rows['+i+'].top',slot.top);set('rows['+i+'].opacity',slot.opacity);});
    this.setData(patch,done);
  },
  onStackPress(e) {
    if(!this.data.stackPositionsReady)return;
    this.setData({pressedStackRoot:e.currentTarget.dataset.rootId || ''});
  },
  onStackRelease() { if(this.data.pressedStackRoot)this.setData({pressedStackRoot:''}); },
  clearOverlayMotionTimer() {
    if(this.overlayMotionTimer){clearTimeout(this.overlayMotionTimer);this.overlayMotionTimer=null;}
  },
  clearHybridHandoffTimer() {
    if(this.hybridHandoffTimer){clearTimeout(this.hybridHandoffTimer);this.hybridHandoffTimer=null;}
  },
  cancelPendingMapAction() {
    this.pendingMapAction=null;
    this.cameraCentreSyncRequest=(this.cameraCentreSyncRequest||0)+1;
  },
  clearHybridCalloutState(patch) {
    this.clearHybridHandoffTimer();
    const had=Boolean(this.hybridCalloutActive||this.data.hybridCalloutRootId);
    this.hybridCalloutActive=false;
    this.hybridInkHidden=false;
    const target=patch||{};
    if(this.data.hybridCalloutRootId)target.hybridCalloutRootId='';
    if(had&&this.drawerOverlayMode()&&(this.data.markers||[]).some(m=>m&&m.customCallout)){
      target.markers=(this.data.markers||[]).map(m=>m&&m.customCallout?Object.assign({},m,{customCallout:undefined}):m);
    }
    return target;
  },
  // Hand off a settled open cluster in view-overlay mode to a single static native
  // customCallout so dragging the map keeps the expanded stack locked to the marker at
  // true 60fps without ever disappearing. WebView ink overlaps for 48ms before hiding
  // so the native layer paints first with zero visible flicker.
  mountHybridCallout(rootId, hideInkNow) {
    if(!this.drawerOverlayMode()||!this.active||this.disposed)return false;
    if(!this.data.clusterOpen||this.drawerRootId!==rootId)return false;
    const markers=this.data.markers||[];
    const mIdx=markers.findIndex(m=>m&&m.memoryId===rootId);
    if(mIdx<0)return false;
    this.clearHybridHandoffTimer();
    this.hybridCalloutActive=true;
    this.hybridInkHidden=Boolean(hideInkNow);
    const mapDrawers=this.buildDrawers(this.markerGroups||[],markers,this.data.selectedId);
    const d=mapDrawers.find(item=>item&&item.rootId===rootId);
    if(!d){this.hybridCalloutActive=false;this.hybridInkHidden=false;return false;}
    const anchorY=d.calloutOffset+mapStack.HEIGHT;
    const nextMarkers=markers.map((m,i)=>{
      if(i===mIdx)return Object.assign({},m,{customCallout:{display:'ALWAYS',anchorX:0,anchorY}});
      if(m&&m.customCallout)return Object.assign({},m,{customCallout:undefined});
      return m;
    });
    this.setData({hybridCalloutRootId:rootId,markers:nextMarkers,mapDrawers});
    if(!hideInkNow){
      this.hybridHandoffTimer=setTimeout(()=>{
        this.hybridHandoffTimer=null;
        if(!this.active||this.disposed||!this.data.clusterOpen||!this.hybridCalloutActive||this.drawerRootId!==rootId)return;
        this.hybridInkHidden=true;
        this.refreshStackFrame();
      },48);
    }
    return true;
  },
  scheduleHybridHandoff(rootId, delayMs) {
    if(!this.drawerOverlayMode()||!this.active||this.disposed)return;
    this.clearHybridHandoffTimer();
    this.hybridHandoffTimer=setTimeout(()=>{
      this.hybridHandoffTimer=null;
      if(!this.active||this.disposed||this.stackGesture)return;
      if(!this.data.clusterOpen||this.drawerRootId!==rootId||this.overlayMountRootId!==rootId||!this.overlayVisualOpen)return;
      this.mountHybridCallout(rootId,false);
    },Number.isFinite(delayMs)?delayMs:(mapStack.DURATION+20));
  },
  // Reverse handoff before a close animation: bring WebView ink back on top of the static
  // native callout for one frame (~32ms), then remove the native callout and trigger the
  // smooth 320ms/200ms WebView CSS collapse transition with zero flicker.
  beginOverlayCloseFromHybrid(rootId, onReady) {
    this.clearHybridHandoffTimer();
    if(!this.hybridCalloutActive&&!this.data.hybridCalloutRootId){
      onReady();
      return;
    }
    this.hybridInkHidden=false;
    this.refreshStackFrame();
    this.overlayMotionTimer=setTimeout(()=>{
      this.overlayMotionTimer=null;
      if(this.disposed||this.data.clusterOpen||this.overlayMountRootId!==rootId)return;
      const clearPatch=this.clearHybridCalloutState({});
      if(Object.keys(clearPatch).length)this.setData(clearPatch);
      onReady();
    },32);
  },
  scheduleOverlayOpenFlip(rootId) {
    this.clearOverlayMotionTimer();
    // Wait two display frames (~32ms) after the collapsed start frame commits to the WebView
    // so CSS transitions always observe the collapsed -> open transform/opacity delta.
    this.overlayMotionTimer=setTimeout(()=>{
      this.overlayMotionTimer=null;
      if(!this.active||this.disposed||this.stackGesture)return;
      if(!this.data.clusterOpen||this.drawerRootId!==rootId||this.overlayMountRootId!==rootId)return;
      if(this.overlayVisualOpen)return;
      this.overlayVisualOpen=true;
      this.refreshStackFrame();
      this.scheduleHybridHandoff(rootId,mapStack.DURATION+20);
    },32);
  },
  dismissOverlayDrawer(patch) {
    this.clearOverlayMotionTimer();
    this.cancelPendingMapAction();
    this.stopDrawerReveal();
    this.drawerResumeTarget=undefined;
    this.overlayMountRootId='';
    this.overlayClosingFast=false;
    this.overlayVisualOpen=false;
    const target=this.clearHybridCalloutState(patch||{});
    target.clusterOpen=false;
    target.drawerPage=0;
    if(this.data.stackPositionsReady)target.stackPositionsReady=false;
    return target;
  },
  shouldAnimateSwitchClose() {
    return Boolean(
      this.drawerOverlayMode() &&
      this.drawerTransformDriver() &&
      this.active &&
      !this.data.quiet &&
      this.data.stackPositionsReady &&
      this.overlayMountRootId
    );
  },
  // Fold the currently open drawer smoothly in place (200ms) on the still map before panning
  // the camera to the newly tapped marker, so the overlay never detaches mid-pan.
  scheduleSwitchClose(action) {
    this.pendingMapAction=action;
    if(this.overlayClosingFast&&this.overlayMotionTimer)return;
    const closingRoot=this.overlayMountRootId;
    this.clearOverlayMotionTimer();
    this.stopDrawerReveal();
    this.drawerProgress=0;
    this.overlayClosingFast=true;
    this.setData({clusterOpen:false,drawerPage:0});
    this.beginOverlayCloseFromHybrid(closingRoot,()=>{
      if(this.disposed||!this.active||this.stackGesture||this.data.clusterOpen||this.overlayMountRootId!==closingRoot)return;
      this.overlayVisualOpen=false;
      this.refreshStackFrame();
      this.overlayMotionTimer=setTimeout(()=>{
        this.overlayMotionTimer=null;
        if(this.disposed||!this.active||this.stackGesture)return;
        if(this.overlayMountRootId===closingRoot){
          this.overlayMountRootId='';
          this.overlayClosingFast=false;
          this.overlayVisualOpen=false;
          const mapDrawers=this.buildDrawers(this.markerGroups||[],this.data.markers,this.data.selectedId);
          this.setData(this.clearHybridCalloutState({stackPositionsReady:false,mapDrawers}));
        }
        const next=this.pendingMapAction;
        this.pendingMapAction=null;
        this.executePendingMapAction(next);
      },DRAWER_SWITCH_CLOSE_MS+DRAWER_CLOSE_SETTLE_PAD_MS);
    });
  },
  executePendingMapAction(action) {
    if(!action||!this.active||this.disposed||this.stackGesture)return;
    if(action.type==='singleton'){
      this.selectMapMemory(action.memoryId);
      return;
    }
    if(action.type==='cluster-pan'){
      this.focusAndOpenClusterById(action.rootId);
    }
  },
  // Prepare a cluster drawer to mount its collapsed start frame on the upcoming projection
  // inside onCameraViewportReady (reusing that single getRegion reply with zero extra IPC).
  prepareClusterOpenForProjection(index) {
    const g=this.markerGroups&&this.markerGroups[index];
    if(!g||g.members.length<2)return;
    const overlayMode=this.drawerOverlayMode();
    const transformDriver=this.drawerTransformDriver();
    const canAnimate=this.active&&!this.data.quiet;
    this.clearOverlayMotionTimer();
    this.stopDrawerReveal();
    this.drawerRootId=g.memory.id;
    this.drawerProgress=(transformDriver||!canAnimate)?1:0;
    this.overlayMountRootId=overlayMode?g.memory.id:'';
    this.overlayClosingFast=false;
    this.overlayVisualOpen=overlayMode?!canAnimate:true;
    const openPatch=this.clearHybridCalloutState({
      clusterOpen:true,
      drawerPage:0,
      clusterChoices:g.members.map(m=>({id:m.id,restaurant:m.restaurant,dateLabel:data.formatDate(m.date)})),
    });
    this.setData(openPatch);
    if(!this.mapCtx||!this.mapCtx.getRegion){
      this.refreshStackFrame(()=>{
        if(overlayMode&&transformDriver&&canAnimate&&!this.overlayVisualOpen)this.scheduleOverlayOpenFlip(g.memory.id);
        this.renderDrawerPhotos(this.markerGeneration);
      });
    }
  },
  focusAndOpenClusterById(rootId) {
    const groups=this.markerGroups||[];
    const initialIndex=groups.findIndex(g=>g.memory.id===rootId&&g.members.length>1);
    if(initialIndex<0)return;
    const scale=Number.isFinite(this.data.mapScale)?this.data.mapScale:13;
    this.withFreshCameraCentre(()=>{
      if(!this.active||this.disposed||this.stackGesture)return;
      const index=(this.markerGroups||[]).findIndex(g=>g.memory.id===rootId&&g.members.length>1);
      if(index<0)return;
      const group=this.markerGroups[index];
      const target=this.clusterFocusCentre(group);
      const dist=mapCamera.panPixels(this.cameraCentre(),target,scale);
      if(this.data.quiet||!Number.isFinite(dist)||dist<CLUSTER_FOCUS_SKIP_PX){
        this.onDrawerToggle({currentTarget:{dataset:{index}}});
        return;
      }
      this.pendingMapAction={type:'cluster-open',rootId};
      this.startCameraTransition(target);
    });
  },
  onDrawerToggle(e) {
    const index=Number(e.currentTarget.dataset.index),g=this.markerGroups&&this.markerGroups[index];
    if(!g||g.members.length<2)return;
    const same=this.drawerRootId===g.memory.id;
    const from=same?this.drawerProgress||0:0;
    const open=!(same&&this.data.clusterOpen);
    const overlayMode=this.drawerOverlayMode();
    const transformDriver=this.drawerTransformDriver();
    const alreadyMountedHere=overlayMode&&transformDriver&&this.overlayMountRootId===g.memory.id&&this.data.stackPositionsReady;
    this.clearOverlayMotionTimer();
    this.clearHybridHandoffTimer();
    this.stopDrawerReveal();this.drawerProgress=from;this.drawerRootId=g.memory.id;
    const togglePatch={clusterOpen:open,drawerPage:same&&from>0?(this.data.drawerPage||0):0,clusterChoices:g.members.map(m=>({id:m.id,restaurant:m.restaurant,dateLabel:data.formatDate(m.date)}))};
    if(!this.active||this.data.quiet)this.drawerProgress=open?1:0;
    // A transform driver has no frame loop: progress IS the target state and the transition
    // supplies everything in between, so it must be set before the rebuild below.
    if(transformDriver)this.drawerProgress=open?1:0;

    if(overlayMode&&transformDriver){
      const canAnimate=this.active&&!this.data.quiet;
      if(open){
        this.overlayClosingFast=false;
        if(alreadyMountedHere){
          // Re-tapped while mid-closing: already anchored at the right coordinates, reverse smoothly.
          this.overlayVisualOpen=true;
          this.setData(togglePatch);
          this.refreshStackFrame(()=>{
            this.scheduleHybridHandoff(g.memory.id,mapStack.DURATION+20);
            this.renderDrawerPhotos(this.markerGeneration);
          });
          return;
        }
        // Switching from another open cluster directly via toggle: clear old hybrid callout & overlay.
        this.clearHybridCalloutState(togglePatch);
        if(this.data.stackPositionsReady)togglePatch.stackPositionsReady=false;
        this.overlayMountRootId=g.memory.id;
        this.overlayVisualOpen=!canAnimate;
        this.setData(togglePatch);
        if(this.mapCtx&&this.mapCtx.getRegion){
          // Opening a drawer never moves or anchors the camera; clear any leftover anchor flag
          // so the on-demand projection cannot write latitude/longitude and trigger regionchange.
          this.cameraAnchorPending=false;
          this.syncStackPositions();
        } else {
          this.refreshStackFrame(()=>{
            if(canAnimate&&!this.overlayVisualOpen)this.scheduleOverlayOpenFlip(g.memory.id);
            else if(!canAnimate&&this.active)this.scheduleHybridHandoff(g.memory.id,32);
            this.renderDrawerPhotos(this.markerGeneration);
          });
        }
        return;
      }
      // Manual closing in view-overlay mode: hand back from static native callout to WebView
      // ink with 1-frame overlap, play the full 320ms collapse transition, then unmount.
      if(canAnimate&&alreadyMountedHere){
        const closingRoot=g.memory.id;
        this.overlayClosingFast=false;
        this.setData(togglePatch);
        this.beginOverlayCloseFromHybrid(closingRoot,()=>{
          if(this.disposed||this.data.clusterOpen||this.overlayMountRootId!==closingRoot)return;
          this.overlayVisualOpen=false;
          this.refreshStackFrame();
          this.overlayMotionTimer=setTimeout(()=>{
            this.overlayMotionTimer=null;
            if(this.disposed||this.data.clusterOpen||this.overlayMountRootId!==closingRoot)return;
            this.overlayMountRootId='';
            this.overlayClosingFast=false;
            this.overlayVisualOpen=false;
            const mapDrawers=this.buildDrawers(this.markerGroups||[],this.data.markers,this.data.selectedId);
            this.setData(this.clearHybridCalloutState({stackPositionsReady:false,mapDrawers}));
          },mapStack.DURATION+30);
        });
        return;
      }
      this.overlayMountRootId='';
      this.overlayClosingFast=false;
      this.overlayVisualOpen=false;
      this.clearHybridCalloutState(togglePatch);
      if(this.data.stackPositionsReady)togglePatch.stackPositionsReady=false;
      this.setData(togglePatch);
      this.refreshStackFrame();
      return;
    }

    // Legacy native-callout / JS frame loop branch.
    this.setData(togglePatch);
    this.refreshStackFrame(()=>{
      if(!transformDriver&&this.active&&!this.data.quiet)this.startDrawerReveal(open?1:0);
      this.renderDrawerPhotos(this.markerGeneration);
    });
  },
  pauseDrawerReveal() {
    this.drawerRun=(this.drawerRun||0)+1;
    if(this.drawerRevealTimer)clearTimeout(this.drawerRevealTimer);
    this.drawerRevealTimer=null;this.drawerAnimating=false;
  },
  stopDrawerReveal() {this.pauseDrawerReveal();this.drawerProgress=0;},
  startDrawerReveal(target) {
    this.pauseDrawerReveal();
    const run=this.drawerRun,root=this.drawerRootId,from=this.drawerProgress||0,start=Date.now(),duration=mapStack.DURATION;
    // Frames sit on an absolute timeline measured from start, never on "16ms after the
    // previous acknowledgement". A slow native setData can therefore reduce the frame
    // count but can never stretch the animation past duration: progress always comes
    // from elapsed time, so a late frame jumps to the correct position instead of
    // pushing the rest of the sequence back.
    const frameMs=1000/60;
    let frame=0;
    this.drawerAnimating=true;
    const valid=()=>this.active&&!this.disposed&&!this.stackGesture&&this.drawerRootId===root&&this.drawerRun===run;
    const schedule=()=>{
      const deadline=Math.min(start+frame*frameMs,start+duration);
      // Behind schedule means zero delay, not a longer animation.
      this.drawerRevealTimer=setTimeout(step,Math.max(0,deadline-Date.now()));
    };
    const step=()=>{
      this.drawerRevealTimer=null;
      if(!valid())return;
      const t=Math.min(1,(Date.now()-start)/duration);
      this.drawerProgress=from+(target-from)*mapStack.ease(t);
      // One frame in flight: native callouts never receive a backlog of whole arrays/photos.
      this.patchDrawerFrame(this.drawerProgress,()=>{
        if(!valid())return;
        if(t<1){frame++;schedule();}
        else {this.drawerAnimating=false;if(target===0)this.refreshStackFrame();}
      });
    };
    schedule();
  },
  onDrawerPage(e) {
    if(!this.data.clusterOpen)return;
    // `open` is not a usable selector any more: the CSS driver keeps every row mounted,
    // so it reports open=true for every cluster and this would page the wrong one.
    // `targetOpen` is the logical open state under both drivers.
    const d=this.data.mapDrawers.find(d=>d.targetOpen);if(!d)return;
    this.stopDrawerReveal();this.drawerProgress=1;
    this.setData({drawerPage:(d.page+Number(e.currentTarget.dataset.step)+d.pages)%d.pages});
    this.refreshStackFrame(()=>this.renderDrawerPhotos(this.markerGeneration));
  },
  onStackRoot(e) {this.selectMapMemory(e.currentTarget.dataset.id,this.data.clusterOpen);},
  // A composed photo may only reach a marker that is, right now, the same thing the
  // job was started for. A generation counter is a poor proxy: a zoom or a drag can
  // bump the generation while an unrelated marker's photo is still composing, and
  // discarding the result then leaves the bundled fallback on screen even though the
  // photo exists. Re-validate the CURRENT object instead, and always look the marker
  // up by memoryId so a regrouped index can never receive another restaurant's photo.
  markerPhotoTarget(memoryId, source, selected, badgeCount) {
    if(this.markerPhotoSkipReason(memoryId,source,selected,badgeCount))return -1;
    return (this.markerGroups||[]).findIndex(g=>g.memory.id===memoryId);
  },
  // Why a finished photo may not be bound, in the vocabulary the device trace reports.
  // Same checks as markerPhotoTarget, but named so a real-device run can tell "the photo
  // never rendered" apart from "it rendered and the map was in a different state".
  markerPhotoSkipReason(memoryId, source, selected, badgeCount) {
    const groups=this.markerGroups||[];
    const index=groups.findIndex(g=>g.memory.id===memoryId);
    if(index<0)return 'superseded';
    // A cluster anchor is invisible under the native callout, so an individual photo must
    // never be painted onto it. Under the ordinary overlay the same marker IS the cluster's
    // visible root, and carries the baked cluster count badge directly on its bitmap.
    const overlayMode=this.drawerOverlayMode();
    if(groups[index].members.length!==1&&!overlayMode)return 'clustered';
    const current=(this.data.markers||[])[index];
    if(!current||current.memoryId!==memoryId)return 'superseded';
    if(Boolean(current.stampSelected)!==Boolean(selected))return 'superseded';
    if(badgeCount!==undefined){
      const currentBadge=overlayMode&&groups[index].members.length>1?groups[index].members.length:1;
      if(currentBadge!==badgeCount)return 'superseded';
    }
    if(mapMarkers.photoFor(groups[index].memory)!==source)return 'source-changed';
    return '';
  },
  // Dev-only. Silent unless utils/mapTrace is switched on, and the stub renderers the
  // suites inject simply carry no traceJobId.
  traceMarker(jobId, patch) {
    const trace=mapMarkers.trace;
    if(trace&&trace.record&&jobId)trace.record(jobId,patch);
  },
  applyMarkerPhotos(entries) {
    if(!entries.length)return false;
    const markers=this.data.markers.map(m=>Object.assign({},m));
    const overlayMode=this.drawerOverlayMode();
    let changed=false;
    entries.forEach(entry=>{
      const index=markers.findIndex(m=>m.memoryId===entry.memoryId);
      if(index<0||markers[index].iconPath===entry.path)return;
      // A queued photo waits up to one frame before it is published, so re-check the
      // render variant: a selection or cluster-count change in that window must not bind
      // the wrong stamp or stale count badge.
      if(entry.selected!==undefined&&Boolean(markers[index].stampSelected)!==Boolean(entry.selected)){
        this.traceMarker(entry.jobId,{applyResult:'superseded'});
        return;
      }
      if(entry.badgeCount!==undefined){
        const currentBadge=overlayMode&&markers[index].groupCount>1?markers[index].groupCount:1;
        if(currentBadge!==entry.badgeCount){
          this.traceMarker(entry.jobId,{applyResult:'superseded'});
          return;
        }
      }
      markers[index].iconPath=entry.path;
      changed=true;
      // A stale job that still matched the CURRENT marker is exactly the case that used
      // to be dropped on the floor; the trace names it so a device run can count it.
      this.traceMarker(entry.jobId,{applyResult:entry.result||(entry.stale?'stale-but-rebound':'applied')});
    });
    if(!changed)return false;
    this.setData({markers});
    return true;
  },
  // One bridge write per display frame, at most. A selected photo flushes immediately:
  // it is the marker the user is looking at, so it never waits behind a normal batch.
  queueMarkerPhoto(memoryId,path,selected,jobId,stale,badgeCount) {
    if(!path)return;
    if(!this.markerPhotoPending)this.markerPhotoPending=new Map();
    this.markerPhotoPending.set(memoryId,{path:path,selected:Boolean(selected),badgeCount:badgeCount,jobId:jobId,stale:Boolean(stale)});
    this.scheduleMarkerPhotoFlush(Boolean(selected));
  },
  // Cache hits are already resolved, so they are published together in one write.
  queueMarkerPhotoBatch(entries) {
    if(!entries.length)return;
    if(!this.markerPhotoPending)this.markerPhotoPending=new Map();
    let selected=false;
    entries.forEach(entry=>{
      if(!entry.path)return;
      this.markerPhotoPending.set(entry.memoryId,{path:entry.path,selected:Boolean(entry.selected),
        badgeCount:entry.badgeCount,jobId:entry.jobId,stale:Boolean(entry.stale)});
      if(entry.selected)selected=true;
    });
    this.scheduleMarkerPhotoFlush(selected);
  },
  scheduleMarkerPhotoFlush(immediate) {
    if(immediate){this.flushMarkerPhotos();return;}
    if(this.markerPhotoTimer)return;
    // Anchored to the previous flush, not to the arrival of this photo: the first photo
    // of a quiet period is published on the next tick (no added latency), and every
    // later burst is held until a full frame has passed, so writes never exceed one per
    // frame no matter how the completions are spread out.
    const now=Date.now(),last=this.markerPhotoFlushAt;
    const wait=(last===undefined)?0:Math.max(0,MARKER_PHOTO_BATCH_MS-(now-last));
    this.markerPhotoTimer=setTimeout(()=>{this.markerPhotoTimer=null;this.flushMarkerPhotos();},wait);
  },
  flushMarkerPhotos() {
    if(this.markerPhotoTimer){clearTimeout(this.markerPhotoTimer);this.markerPhotoTimer=null;}
    const pending=this.markerPhotoPending;
    if(!pending||!pending.size)return false;
    this.markerPhotoPending=new Map();
    this.markerPhotoFlushAt=Date.now();
    const entries=[];
    pending.forEach((value,memoryId)=>entries.push({memoryId,path:value.path,selected:value.selected,badgeCount:value.badgeCount,jobId:value.jobId,stale:value.stale}));
    return this.applyMarkerPhotos(entries);
  },
  stopMarkerPhotoBatch() {
    if(this.markerPhotoTimer){clearTimeout(this.markerPhotoTimer);this.markerPhotoTimer=null;}
    if(this.markerPhotoPending)this.markerPhotoPending.clear();
  },
  // Publish photos that are already composed but were never bound. Runs only from
  // existing event points (region end, grouping settle, job completion) - never a timer.
  rebindReadyMarkerPhotos() {
    if(!this.pinRenderer||!this.active||this.disposed||this.stackGesture)return false;
    const overlayMode=this.drawerOverlayMode();
    const groups=this.markerGroups||[],entries=[];
    groups.forEach((group,index)=>{
      if(group.members.length!==1&&!overlayMode)return;
      const current=(this.data.markers||[])[index];
      if(!current||current.memoryId!==group.memory.id)return;
      const badgeCount=overlayMode&&group.members.length>1?group.members.length:1;
      const path=this.pinRenderer.peek&&this.pinRenderer.peek(group.memory,current.stampSelected,badgeCount);
      if(!path||path===current.iconPath)return;
      // This is the rebound case by definition: a photo that was already composed but
      // never bound to the marker that still wants it. It gets its own trace token so a
      // device run can tell "composed late" apart from "composed but never published".
      entries.push({memoryId:group.memory.id,path:path,selected:current.stampSelected,badgeCount:badgeCount,stale:true,
        result:'ready-cache-rebound',
        jobId:this.pinRenderer.traceJobId&&this.pinRenderer.traceJobId(group.memory,current.stampSelected,badgeCount)});
    });
    return this.applyMarkerPhotos(entries);
  },
  // Whether any currently visible marker still needs photo composition or cache rebinding.
  // Used by onMapRegionChange(end) so a pure pan with already-composed markers skips all
  // post-gesture timers and bridge writes completely.
  hasUnboundMarkerPhotos() {
    if(!this.pinRenderer||!this.active||this.disposed)return false;
    const overlayMode=this.drawerOverlayMode();
    const groups=this.markerGroups||[];
    const markers=this.data.markers||[];
    for(let index=0;index<groups.length;index++){
      const group=groups[index];
      if(!group||!group.memory)continue;
      if(group.members.length!==1&&!overlayMode)continue;
      const source=mapMarkers.photoFor(group.memory);
      if(!source||(data.isSafeImage&&!data.isSafeImage(source)))continue;
      const current=markers[index];
      if(!current||current.memoryId!==group.memory.id)continue;
      const badgeCount=overlayMode&&group.members.length>1?group.members.length:1;
      const cached=this.pinRenderer.peek&&this.pinRenderer.peek(group.memory,current.stampSelected,badgeCount);
      if(!cached||current.iconPath!==cached)return true;
    }
    return false;
  },
  renderMarkerPhotos(visible, selectedId, generation) {
    if (!this.pinRenderer || !this.active || this.stackGesture) return;
    const renderer=this.pinRenderer;
    // The renderer bounds its own prepare/compose concurrency, so the page no longer
    // caps the batch: capping here stranded every singleton past the cap on the
    // bundled fallback for the rest of the session. Selected still goes first.
    // `generation` is kept for call-site compatibility; it is deliberately NOT the
    // apply gate any more (see markerPhotoTarget).
    // Singletons are the only markers the native callout can enhance. In view-overlay mode
    // the cluster's own marker is its visible root, so its representative joins the batch
    // with its native cluster count badge baked into the bitmap.
    const overlayMode=this.drawerOverlayMode();
    const groups=this.markerGroups||[];
    const markers=this.data.markers||[];
    const ordered=visible.map((m,index)=>({
      m,
      index,
      groupCount:groups[index]?groups[index].members.length:1,
    })).filter(({groupCount})=>overlayMode||groupCount===1)
      .sort((a,b)=>Number(b.m.id===selectedId)-Number(a.m.id===selectedId));
    const already=[];
    ordered.forEach(({m,index,groupCount})=>{
      const selected=m.id===selectedId,source=mapMarkers.photoFor(m);
      const badgeCount=overlayMode&&groupCount>1?groupCount:1;
      const cached=renderer.peek&&renderer.peek(m,selected,badgeCount);
      if(cached){
        const current=markers[index];
        if(!current||current.memoryId!==m.id||current.iconPath!==cached){
          already.push({memoryId:m.id,path:cached,selected:selected,badgeCount:badgeCount,stale:true,
            jobId:renderer.traceJobId&&renderer.traceJobId(m,selected,badgeCount)});
        }
        return;
      }
      const job=renderer.render(m,selected,badgeCount);
      job.then(path=>{
        const jobId=job&&job.traceJobId;
        if(!this.active || this.disposed || renderer!==this.pinRenderer) { this.traceMarker(jobId,{applyResult:'disposed'}); return; }
        if(this.stackGesture) { this.traceMarker(jobId,{applyResult:'gesture-deferred'}); return; }
        const skip=this.markerPhotoSkipReason(m.id,source,selected,badgeCount);
        if(skip) { this.traceMarker(jobId,{applyResult:skip}); return; }
        // A generation bump that left this marker unchanged must not cost it its photo.
        this.queueMarkerPhoto(m.id,path,selected,jobId,generation!==this.markerGeneration,badgeCount);
      }).catch(()=>{});
    });
    if(already.length)this.queueMarkerPhotoBatch(already);
  },

  stopMarkerAnimation() { if(this.markerAnimation) clearTimeout(this.markerAnimation);this.markerAnimation=null; },
  animateMarkerSizes(items,generation) {
    if(!items.length || this.data.quiet || !this.active) return;
    const start=Date.now();
    const step=()=>{
      if(!this.active || this.disposed || this.markerGeneration!==generation) return;
      const t=Math.min(1,(Date.now()-start)/200);
      // Native map receives complete marker objects, never nested width/height patches.
      const markers=this.data.markers.map(m=>Object.assign({},m));
      items.forEach(item=>{if(!markers[item.index])return;const w=mapLayout.easedSize(item.from,item.to,t);markers[item.index].width=Math.max(1,Math.round(w));markers[item.index].height=Math.max(1,Math.round(w*286/256));});
      this.setData({markers});
      if(t<1) this.markerAnimation=setTimeout(step,25);else this.markerAnimation=null;
    };
    this.markerAnimation=setTimeout(step,25);
  },
  // ---- Zoom stepper -------------------------------------------------------
  // One tap issues at most one camera command, and that command always names a
  // whole level: the bound `scale` prop floors fractions, so asking for 13.82
  // would land on 13 and read to the user as "the button did nothing".
  onZoomIn() { this.requestZoom(1); },
  onZoomOut() { this.requestZoom(-1); },

  // Presentation preference only. Native provider POIs are geographic context, so the product
  // default is ON and the user may simplify the map; the choice rides the existing device-level
  // settings pattern (theme / language / reduceMotion) and is remembered per device. Nothing about
  // Savor's own markers, the selection, the card, the query or the camera is touched here.
  onToggleNativePoi() {
    store.updateSettings({ showNativePoi: this.data.showNativePoi === false });
  },

  // Direction-aware adjacent level. Deliberately NOT round(current) + delta: that
  // would send 13.49 up to 14 while 13.51 jumps to 15, so the same tap would travel
  // a different distance depending on which side of the rounding boundary a pinch
  // happened to land on.
  zoomAdjacentLevel(current, direction) {
    if (!Number.isFinite(current)) return null;
    const step = direction < 0 ? -1 : 1;
    const nearest = Math.round(current);
    const target = Math.abs(current - nearest) <= ZOOM_LEVEL_EPSILON
      ? nearest + step
      : (step > 0 ? Math.ceil(current) : Math.floor(current));
    return Math.max(ZOOM_MIN_SCALE, Math.min(ZOOM_MAX_SCALE, target));
  },

  requestZoom(direction) {
    if (!this.active || this.disposed || this.stackGesture || this.data.mapError) return;
    const step = direction < 0 ? -1 : 1;
    const pending = this.zoomPendingTarget;
    if (Number.isFinite(pending)) {
      // A command is still settling. Reading the native scale here would return the
      // pre-command value and repeat the same level, so a burst of taps advances
      // from the level the previous tap asked for instead.
      this.issueZoomCommand(this.zoomAdjacentLevel(pending, step), pending);
      return;
    }
    if (!this.mapCtx || !this.mapCtx.getScale) return;
    const request = this.zoomReadRequest = (this.zoomReadRequest || 0) + 1;
    this.mapCtx.getScale({
      success: (reply) => {
        if (request !== this.zoomReadRequest || !this.active || this.disposed || this.stackGesture) return;
        const current = reply && reply.scale;
        this.issueZoomCommand(this.zoomAdjacentLevel(current, step), current);
      },
      fail: () => {},
    });
  },

  // The single place that writes the camera binding. `from` is where this tap was
  // resolved from: the settling target, or the freshly read native scale.
  issueZoomCommand(target, from) {
    if (!Number.isFinite(target)) return;
    const base = Number.isFinite(from) ? from : this.data.mapScale;
    // Already at the requested level. Only reachable at a clamp boundary, and the level
    // is KEPT as the pending target rather than dropped: dropping it would let the next
    // tap re-derive the same level from a native scale that has not caught up yet and
    // re-issue it. Convergence, or a gesture, clears it.
    if (Math.abs(target - base) <= ZOOM_LEVEL_EPSILON) { this.zoomPendingTarget = target; return; }
    this.zoomCommandCount = (this.zoomCommandCount || 0) + 1;
    this.zoomPendingTarget = target;
    // A zoom is the user taking the camera: a travel still in flight was aimed at the old
    // scale, so it stops here instead of fighting the new level.
    this.cancelPendingMapAction();
    this.cancelCameraTransition();
    // The guard above compares against the NATIVE level, never against the bound
    // value. When a pinch leaves the native scale on 13.4 while the binding already
    // holds 13, the tap must still write 13: the write itself is the command.
    this.setData({ commandScale: target });
  },

  // A command is done once the native map reports the level it was asked for.
  settleZoomCommand(observed) {
    if (!Number.isFinite(this.zoomPendingTarget) || !Number.isFinite(observed)) return;
    if (Math.abs(observed - this.zoomPendingTarget) <= ZOOM_LEVEL_EPSILON) { this.clearZoomCommand(); return; }
    // Every level this control asks for is a whole number, so a fractional native
    // scale while a command is in flight cannot have come from here.
    if (Math.abs(observed - Math.round(observed)) > ZOOM_LEVEL_EPSILON) this.clearZoomCommand();
  },

  // A finger outranks a settling command: drop the pending target so a stale one can
  // never drag the map back after the user has pinched somewhere else.
  cancelZoomCommand(event) {
    if (!Number.isFinite(this.zoomPendingTarget)) return;
    const causedBy = event && event.detail && event.detail.causedBy;
    if (causedBy === 'gesture' || causedBy === 'drag' || causedBy === 'scale') this.clearZoomCommand();
  },

  clearZoomCommand() { this.zoomPendingTarget = undefined; },

  onMapRegionChange(e) {
    const phase=e&&e.detail&&e.detail.type||e&&e.type;
    // A programmatic transition drives its own frames through the bound centre, and every
    // one of those writes raises regionchange (measured: 2 begin/end pairs per write).
    // Running the derived work per frame — re-projecting, re-reading the scale, regrouping
    // markers — is exactly the bridge flood the transition token exists to prevent, so our
    // own writes are ignored outright and reconciled once, when the camera settles.
    // A real finger always outranks the transition: a gesture cancels it and falls through
    // to the normal path unchanged.
    const causedBy=e&&e.detail&&e.detail.causedBy;
    const isUserGesture=causedBy==='gesture'||causedBy==='drag'||causedBy==='scale';
    if (this.cameraTransition) {
      if(isUserGesture)this.cancelCameraTransition();
      else return;
    }
    // Ignore trailing asynchronous regionchange echoes emitted by our own final programmatic
    // latitude/longitude frame right after landing on a cluster to open it; real user gestures
    // always pass through immediately.
    if (!isUserGesture && this.data.clusterOpen && this.cameraClusterOpenSettledAt && (Date.now() - this.cameraClusterOpenSettledAt) < 500) {
      return;
    }
    const overlayMode=this.drawerOverlayMode();
    clearTimeout(this.stackAlignTimer);this.stackAlignTimer=null;
    this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    this.stackProjectionBusy=false;
    this.onStackRelease();
    if(phase==='begin') {
      // A scale reply from before the gesture must never write camera props during it.
      this.scaleRequest=(this.scaleRequest||0)+1;
      // A finger outranks a settling zoom command or queued drawer-switch handoff.
      this.cancelZoomCommand(e);
      if(causedBy!=='update'){
        this.cameraCentreStale=true;
        this.cancelPendingMapAction();
      }
      this.stackGesture=true;
      if(overlayMode){
        // In view-overlay mode collapsed clusters carry zero overlay DOM, so starting a
        // drag while closed performs zero setData work. An already-open cluster stays
        // logically open across a pan (only hiding its projected overlay during movement
        // and re-anchoring once at drag end), while a drawer that was already closing
        // finishes dismissing cleanly on drag begin.
        if(causedBy!=='update'){
          if(this.data.clusterOpen){
            this.clearOverlayMotionTimer();
            this.overlayClosingFast=false;
            if(this.overlayMountRootId===this.drawerRootId)this.overlayVisualOpen=true;
            // Ensure the single static native customCallout is mounted immediately if the user
            // started dragging before the 320ms open animation finished, so the expanded stack
            // stays continuously visible at 60fps throughout the entire drag.
            if(!this.hybridCalloutActive&&this.drawerRootId)this.mountHybridCallout(this.drawerRootId,true);
            else if(!this.hybridInkHidden){this.clearHybridHandoffTimer();this.hybridInkHidden=true;}
            if(this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
          } else if(this.drawerProgress>0||this.drawerAnimating||this.overlayMountRootId||this.overlayMotionTimer||this.hybridCalloutActive){
            this.setData(this.dismissOverlayDrawer({}));
            this.refreshStackFrame();
          } else if(this.data.stackPositionsReady){
            this.setData({stackPositionsReady:false});
          }
        }
      } else {
        // Legacy callout mode: only hit regions disappear; native callouts stay anchored.
        if(this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
        if(this.drawerAnimating){this.drawerResumeTarget=this.data.clusterOpen?1:0;this.pauseDrawerReveal();}
      }
      this.markerResumeNeeded=this.markerResumeNeeded||!!this.markerAnimation;this.stopMarkerAnimation();
      return;
    }
    if(!overlayMode&&this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
    this.stackGesture=false;
    // A gesture can bump the generation while photos are still composing; the region
    // end is exactly where those ready results must be bound. No polling timer.
    this.rebindReadyMarkerPhotos();
    this.readMapScale(e && e.detail && e.detail.scale);
    const needsSettle=Boolean(
      this.deferredMapState ||
      this.markerResumeNeeded ||
      !overlayMode ||
      this.data.clusterOpen ||
      this.drawerProgress > 0 ||
      this.drawerResumeTarget !== undefined ||
      this.hasUnboundMarkerPhotos()
    );
    if(this.active&&!this.disposed&&needsSettle) {
      this.stackAlignTimer=setTimeout(()=>{
        this.stackAlignTimer=null;
        if(!this.active||this.disposed||this.stackGesture)return;
        const state=this.deferredMapState;this.deferredMapState=null;
        if(state)this.syncState(store.get());
        else if(this.markerResumeNeeded)this.applyFilters(this.data.query,this.data.filter,this.data.selectedId,'preserve');
        this.markerResumeNeeded=false;
        const needOverlay=!this.drawerOverlayMode()||Boolean(this.data.clusterOpen)||Boolean(this.drawerProgress>0);
        if(needOverlay)this.syncStackPositions();
        this.rebindReadyMarkerPhotos();
        if(needOverlay)this.renderDrawerPhotos(this.markerGeneration);
        if(this.hasUnboundMarkerPhotos())this.renderMarkerPhotos((this.markerGroups||[]).map(g=>g.memory),this.data.selectedId,this.markerGeneration);
        if(this.drawerResumeTarget!==undefined){const target=this.data.clusterOpen?1:0;this.drawerResumeTarget=undefined;if(Math.abs((this.drawerProgress||0)-target)>.001)this.startDrawerReveal(target);}
      },80);
    }
  },
  readMapScale(value) {
    if(!this.active || this.disposed || this.stackGesture) return;
    const request=this.scaleRequest=(this.scaleRequest||0)+1;
    const update=scale=>{
      if(!this.active || this.disposed || this.stackGesture || request!==this.scaleRequest || !Number.isFinite(scale)) return;
      // A settling zoom command is confirmed here, ahead of the no-change shortcut.
      this.settleZoomCommand(scale);
      if(Math.abs(scale-this.data.mapScale)<.05) return;
      const nextScale=Math.max(3,Math.min(18,scale));
      const rootId=(this.data.clusterOpen||this.drawerProgress>0)?this.drawerRootId:this.data.selectedId;
      const groups=mapLayout.group(visibleMemories(this.allMemories||[],this.data.query,this.data.filter),nextScale,rootId);
      const same=(a,b)=>!!a&&!!b&&a.memory.id===b.memory.id&&a.members.length===b.members.length&&a.members.every((m,i)=>m.id===b.members[i].id);
      const previous=this.markerGroups||[];
      // A camera scale update is not a new restaurant selection or a drawer-close intent.
      // Keep native callouts/photos mounted when grouping did not change.
      if(groups.length===previous.length&&groups.every((g,i)=>same(g,previous[i]))) {
        this.setData({mapScale:nextScale});
        // Grouping settled without changing: bind anything that finished composing.
        this.rebindReadyMarkerPhotos();
        return;
      }
      // A distant group may split while the open group remains identical.
      const keepDrawer=this.data.clusterOpen&&same(previous.find(g=>g.memory.id===this.drawerRootId),groups.find(g=>g.memory.id===this.drawerRootId));
      if(!keepDrawer)this.setData(this.dismissOverlayDrawer({mapScale:nextScale}));
      else this.setData({mapScale:nextScale});
      this.applyFilters(this.data.query,this.data.filter,this.data.selectedId,'preserve');
    };
    // While a zoom command is in flight the event payload is not trustworthy: some
    // platforms report the pre-move scale in `regionchange`. Ask the map directly.
    if(Number.isFinite(this.zoomPendingTarget)) {
      if(this.mapCtx && this.mapCtx.getScale) this.mapCtx.getScale({success:r=>update(r.scale),fail:()=>{}});
      return;
    }
    if(Number.isFinite(value)) update(value);
    else if(this.mapCtx && this.mapCtx.getScale) this.mapCtx.getScale({success:r=>update(r.scale),fail:()=>{}});
  },
  onMarkerTap(event) {
    const index=event.detail.markerId,group=this.markerGroups && this.markerGroups[index];
    if(group && group.members.length>1) {
      // Tapping the currently open cluster's own root selects its representative card
      // while keeping the drawer open.
      if(this.data.clusterOpen&&this.drawerRootId===group.memory.id){
        this.selectMapMemory(group.memory.id,true);
        return;
      }
      // Tapping a cluster while it is mid-closing reverses it smoothly back open in place.
      if(this.drawerOverlayMode()&&this.overlayMountRootId===group.memory.id&&this.data.stackPositionsReady){
        this.cancelPendingMapAction();
        this.overlayClosingFast=false;
        this.onDrawerToggle({currentTarget:{dataset:{index}}});
        return;
      }
      // Switching from another open cluster: smoothly fold the old drawer in 200ms on the
      // still map first, then glide the camera to the new cluster's drawer-framed anchor.
      if(this.shouldAnimateSwitchClose()){
        this.cancelCameraTransition();
        this.scheduleSwitchClose({type:'cluster-pan',rootId:group.memory.id});
        return;
      }
      this.cancelPendingMapAction();
      this.focusAndOpenClusterById(group.memory.id);
      return;
    }
    const memoryId=this.visibleIds && this.visibleIds[index];
    if(!memoryId)return;
    // Tapping a singleton while a cluster drawer is open: fold the drawer smoothly in 200ms
    // on the still map first, then switch card and glide the camera to the singleton.
    if(this.shouldAnimateSwitchClose()){
      this.cancelCameraTransition();
      this.scheduleSwitchClose({type:'singleton',memoryId});
      return;
    }
    this.cancelPendingMapAction();
    this.selectMapMemory(memoryId);
  },
  selectMapMemory(memoryId,keepDrawer) {
    if(!(this.allMemories||[]).some(m=>m.id===memoryId)) return;
    const keep=Boolean(keepDrawer&&this.data.clusterOpen);
    const patch={selectedId:memoryId,cardCollapsed:false,clusterOpen:keep};
    if(!keep)this.dismissOverlayDrawer(patch);
    this.setData(patch);
    this.applyFilters(this.data.query,this.data.filter,memoryId);
  },
  onClusterPick(e) { if(!this.data.clusterOpen)return;const id=e.currentTarget.dataset.id;if(!this.data.clusterChoices.some(m=>m.id===id))return;this.selectMapMemory(id,true); },
  onClusterClose() { const index=(this.markerGroups||[]).findIndex(g=>g.memory.id===this.drawerRootId);if(this.data.clusterOpen&&index>=0){this.onDrawerToggle({currentTarget:{dataset:{index}}});return;}this.setData(this.dismissOverlayDrawer({}));this.refreshStackFrame(); },
  onTogglePlaceCard() { this.setData({cardCollapsed:!this.data.cardCollapsed}); },

  onQuery(event) {
    const query = event.detail.value;
    this.setData(this.dismissOverlayDrawer({ query: query, showFilters: false }));
    this.applyFilters(query, this.data.filter, this.data.selectedId);
  },

  onToggleFilters() {
    this.setData({ showFilters: !this.data.showFilters });
  },

  onFilterPick(event) {
    const value = event.currentTarget.dataset.value;
    this.setData(this.dismissOverlayDrawer({ filter: value, showFilters: false }));
    if (value === 'all' && !this.data.query) this.recenter();
    else this.applyFilters(this.data.query, value, this.data.selectedId);
  },

  recenter() {
    // An overview must not silently move the selection: keep the memory the
    // reader is on while it stays visible, so card and map agree afterwards.
    // visibleIds is the native marker-index mapping (roots only). A selected
    // drawer child is still visible while it belongs to a filtered marker group.
    const visibleChild = (this.markerGroups || []).some(g => (g.members || []).some(m => m.id === this.data.selectedId));
    const keep = (this.visibleIds || []).indexOf(this.data.selectedId) >= 0 || visibleChild
      ? this.data.selectedId : 'comptoir';
    this.setData(this.dismissOverlayDrawer({ query: '', filter: 'all', selectedId: keep, showFilters: false }));
    this.applyFilters('', 'all', keep, 'overview');
  },

  onEmptyMapAction() {
    if ((this.data.query || '').trim()) this.onClearSearch();
    else if (this.data.filter !== 'all') this.onFilterPick({currentTarget:{dataset:{value:'all'}}});
    else if (this.data.pendingCount) this.onFillLocation();
    else this.recenter();
  },

  onTogglePending() { this.setData({ pendingExpanded: !this.data.pendingExpanded }); },
  onCollapsePending() { this.setData({ pendingExpanded: false }); },

  onFillLocation(pageIndex) {
    if (this.locationBusy || !this.pendingLocations.length) return;
    this.setData({ pendingExpanded: false });
    const total=this.pendingLocations.length,page=Math.max(0,Math.min(typeof pageIndex==='number'?pageIndex:0,Math.ceil(total/4)-1));
    const start=page*4,batch=this.pendingLocations.slice(start,start+4),token=identity.lease();
    // Four records leave room for both navigation controls within the native six-entry cap.
    const itemList=batch.map(m=>(m.restaurant+' · '+m.date).slice(0,48));
    const previous=page>0?itemList.push(i18n.t('Previous page'))-1:-1;
    const next=start+batch.length<total?itemList.push(i18n.t('Next page'))-1:-1;
    wx.showActionSheet({alertText:(start+1)+'–'+(start+batch.length)+' / '+total,itemList,
      success:result=>{
        if(!this.active||this.disposed||!identity.isCurrent(token))return;
        if(result.tapIndex===previous&&previous>=0){this.onFillLocation(page-1);return;}
        if(result.tapIndex===next&&next>=0){this.onFillLocation(page+1);return;}
        const chosen=batch[result.tapIndex];
        if(chosen&&this.pendingLocations.some(m=>m.id===chosen.id))this.pickLocationFor(chosen);
      }});
  },
  onCorrectLocation() { if (this.data.selected) return this.pickLocationFor(this.data.selected); },
  pickLocationFor(memory) {
    if (!memory || this.locationBusy) return;
    this.locationBusy = true;
    let token=identity.lease();
    return locations.choose(memory).then(async location => {token=await identity.resumeNative(token);return store.setMemoryLocation(memory, location);})
      .then(() => {if(identity.isCurrent(token))store.notify(i18n.t('餐馆位置已保存。'));})
      .catch(error => { if (identity.isCurrent(token)&&!error.cancelled) store.notify(error.message || i18n.t('位置保存失败，请重试。')); })
      .finally(() => { this.locationBusy = false; });
  },
  onNavigate() {
    const memory = this.data.selected;
    if (!memory) return;
    wx.openLocation({ latitude: memory.coordinates[0], longitude: memory.coordinates[1],
      name: memory.locationName || memory.restaurant, address: memory.address || '', scale: 17,
      fail: () => store.notify(i18n.t('暂时无法打开地图导航。')) });
  },

  onMapError() {
    this.setData({ mapError: true });
  },

  onMapRetry() {
    this.setData({ mapError: false });
  },

  onPlaceOpen() {
    if (this._memoryPreview) this._memoryPreview.cancel();
    const selected = this.data.selected;
    if (!selected) return;
    this.setData({ sheetShow: true, sheetType: 'memory', sheetMemoryId: selected.id, sheetFilter: '', sheetReadingPosition: null });
  },

  onBookmark() {
    const selected = this.data.selected;
    if (!selected) return;
    store.updateMemory(selected.id, { saved: !selected.saved });
    store.notify(selected.saved ? i18n.t('Place removed from your favorites.') : i18n.t('A good place to come back to. Saved.'));
  },

  onClearSearch() {
    this.onQuery({detail:{value:''}});
  },

  onNativePreview(event) { return require('../../utils/memoryPreview').open(this, event.detail); },
  // Called by the existing same-owner/lease-verified preview return helper.
  // Identity redaction may have reset Map selection while retaining reading intent.
  restoreMemoryParent() {
    const id=this.data.sheetMemoryId;
    if(!this.active||this.disposed||identity.snapshot().locked||!this.data.sheetShow||this.data.sheetType!=='memory')return;
    if(!visibleMemories(this.allMemories||[],this.data.query,this.data.filter).some(m=>m.id===id))return;
    if(this.data.selectedId===id&&this.data.selected&&this.data.selected.id===id)return;
    this.applyFilters(this.data.query,this.data.filter,id,'preserve');
  },

  onSheetChange(event) {
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.setData({
      sheetReadingPosition: null,
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },

  onSheetClose(event) {
    if (!(event && event.detail && event.detail.reason === 'identity') && this._memoryPreview) this._memoryPreview.cancel();
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
});
