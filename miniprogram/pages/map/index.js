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
const restaurantCategory = require('../../utils/restaurantCategory');

// Marker photos arrive asynchronously and each one used to trigger its own whole-array
// setData({markers}). That is the most expensive write the map can make: every write
// clones the entire marker list across the JS -> native bridge. Photos that become ready
// inside the same display frame are therefore collected and published once. The window is
// one frame, not a fixed pause: it adds no visible latency to a photo that is already the
// only one ready, and it collapses a burst into a single bridge write.
const MARKER_PHOTO_BATCH_MS = 16;

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
    // Bind only the initial camera seed; observed zoom is for grouping, not camera commands.
    initialMapScale:13,
    stackPositionsReady:false, mapScale:13, cardCollapsed:false, clusterOpen:false, clusterChoices:[], mapDrawers:[], drawerPage:0,
    resultsCount: 0,
    selected: null,
    selectedPhoto: '',
    distanceLabel: '',
    mapError: false,
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
  initMarkerRenderer() {
    if(this.active && this.markerCanvas && !this.pinRenderer) {
      try {this.pinRenderer=mapMarkers.createRenderer(this.markerCanvas);} catch(e) { /* bundled fallback remains usable */ }
    }
  },
  onResize() { const m=metrics.getMetrics(true); this.setData({headerTop:m.headerTop,overlayTop:m.headerTop+120},()=>{this.syncOverlayClearance();this.syncStackPositions();}); },
  onHide() {
    this.markerCanvasRequest=(this.markerCanvasRequest||0)+1;this.markerCanvasPending=false;
    this.onStackRelease();
    this.stackGesture=false;clearTimeout(this.stackAlignTimer);this.stackAlignTimer=null;
    this.stackProjectionBusy=false;
    this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    this.stopMarkerAnimation();
    this.stopDrawerReveal();
    this.stopMarkerPhotoBatch();
    this.setData({clusterOpen:false,mapDrawers:[],stackPositionsReady:false});
    this.deferredMapState=null;this.drawerResumeTarget=undefined;this.markerResumeNeeded=false;
    this.active=false;this.markerGeneration=(this.markerGeneration||0)+1;
    if(this.pinRenderer) this.pinRenderer.dispose();this.pinRenderer=null;
  },
  onUnload() {
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.disposed=true;this.onHide();
    if (this.unsubscribe) this.unsubscribe();
  },

  onShow() {
    try { const rect=wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) this.setData({menuButtonTop:rect.top,menuButtonHeight:rect.height,menuButtonBorderRadius:rect.height/2}); } catch(e){}

    const m=metrics.getMetrics(true); this.setData({headerTop:m.headerTop,overlayTop:m.headerTop+120});
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
    try {
      const session = identity.snapshot();
      if (session.locked || session.status === 'verifying') await identity.verify();
      if (!this.active || this.disposed) return;
      await store.syncCloud();
    } catch (error) {
      if (!this.active || this.disposed || identity.isDiagnosisActive()) return;
      // A failed/changed identity is rendered by the identity gate, not a cache Toast.
      if (identity.snapshot().locked || ['IDENTITY_LOCKED', 'STALE_IDENTITY'].includes(error && error.code)) return;
      store.notify(i18n.t('地图正在显示缓存记录，云同步暂不可用。'));
    }
  },

  syncState(state) {
    i18n.syncPage(this, state, 1);
    // Identity appearance updates remain immediate; defer only map rendering during a pan.
    // Remember work, never retain a private account snapshot across a gesture.
    this.deferredMapState=null;
    if(this.stackGesture && !identity.snapshot().locked){this.deferredMapState=true;return;}
    const isSample = m => !m.cloudId && data.initialMemories.some(seed => seed.id === m.id);
    const real = state.memories.filter(m => !isSample(m));
    this.pendingLocations = real.filter(m => !locations.confirmed(m) || !m.geoConfirmed);
    this.allMemories = real.length ? real.filter(locations.confirmed) : state.memories.filter(isSample);
    this.setData({ pendingCount: this.pendingLocations.length, demoMode: !real.length });
    this.setData({ dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion });
    this.applyFilters(this.data.query, this.data.filter, this.data.selectedId, 'preserve');
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
    if(this.data.clusterOpen&&!groups.some(g=>g.memory.id===this.drawerRootId&&g.members.length>1))this.setData({clusterOpen:false,drawerPage:0});
    const representatives=groups.map(g=>g.memory);
    const previous=this.data.markers || [];
    const animation=[];
    const markers = representatives.map((memory, index) => {
      const isSelected = Boolean(selected && memory.id === selected.id);
      const old=previous.find(m=>m.memoryId===memory.id);
      const target=mapMarkers.style(isSelected);
      if(groups[index].members.length>1){target.width=80;target.height=90;}
      const cached=this.pinRenderer && this.pinRenderer.peek && this.pinRenderer.peek(memory,isSelected);
      if(cached) target.iconPath=cached;
      else if(old && old.groupCount===1 && old.stampSelected===isSelected) target.iconPath=old.iconPath;
      // A stack anchor is transparent and 1px wide; it is never a singleton image/size.
      const from=old&&old.groupCount===1?old.width:48;
      if(groups[index].members.length===1 && this.active && !this.data.quiet && Math.abs(from-target.width)>.1) {animation.push({index,from,to:target.width});target.width=from;target.height=from*286/256;}
      if(groups[index].members.length>1){
        if(overlayMode){
          // The animated drawer left the native map, so the cluster needs a VISIBLE static
          // marker: during a pan/zoom the ordinary overlay is hidden, and without this the
          // whole group would blink out of existence. It reuses the root photo the drawer
          // already composes, keeps the {x:0.5,y:1} anchor so the projected coordinate and
          // the overlay frame stay in step, and adds no asset.
          target.width=80;target.height=89;target.anchor={x:0.5,y:1};
          target.iconPath=cached||mapMarkers.style(isSelected).iconPath;
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
        // A callout exists to carry animated drawer ink. In overlay mode the ordinary view
        // layer owns that ink, so the cluster must not mount one at all: the native marker
        // data then stays constant for the whole 320ms and the map never re-lays-out.
        customCallout:(groups[index].members.length>1&&!overlayMode)?{display:'ALWAYS',anchorX:0,anchorY:0}:undefined,
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
    if (shouldFocus && viewportMode !== 'overview') {
      patch.latitude = selected.coordinates[0]; patch.longitude = selected.coordinates[1];
    }
    // IDE 的全览指令可能停在旧中心：同一批可见点改由既有受控属性表达。
    // 只更新中心，不改变缩放、分组、固定边界与 320ms 动效。
    const overviewLocalFit = viewportMode === 'overview' && visible.length > 1 && this.cameraFitLocal();
    if (overviewLocalFit) {
      let la = Infinity, hi = -Infinity, lo = Infinity, hj = -Infinity;
      visible.forEach(function (m) {
        la = Math.min(la, m.coordinates[0]); hi = Math.max(hi, m.coordinates[0]);
        lo = Math.min(lo, m.coordinates[1]); hj = Math.max(hj, m.coordinates[1]);
      });
      patch.latitude = (la + hi) / 2; patch.longitude = (lo + hj) / 2;
    }
    // Wait for the marker/card update before issuing one camera command.
    // A native pan need not update data.latitude: explicit focus also handles
    // tapping the same marker again after panning away.
    this.setData(patch, () => {
      this.ensureMarkerRenderer();
      this.syncOverlayClearance();
      this.syncStackPositions();
      this.animateMarkerSizes(animation,generation);
      this.renderMarkerPhotos(representatives, selected && selected.id, generation);
      this.renderDrawerPhotos(generation);
      if (!this.mapCtx) return;
      if (viewportMode === 'overview' && visible.length) {
        const points = visible.map(m => ({latitude:m.coordinates[0], longitude:m.coordinates[1]}));
        const overviewReason = overviewLocalFit ? 'overview-bound-fit' : 'overview';
        try {this.mapCtx.includePoints({ points, padding: [90, 40, 165, 40],success:()=>this.onCameraViewportReady(generation,overviewReason),fail:()=>{} });}catch(e){/* Existing viewport remains usable. */}
      } else if (shouldFocus) {
        this.focusMapCamera(selected.coordinates);
      }
    });
  },

  focusMapCamera(coordinates) {
    const latitude=coordinates[0],longitude=coordinates[1];
    let devtools=false;
    try {const info=wx.getDeviceInfo?wx.getDeviceInfo():wx.getSystemInfoSync?wx.getSystemInfoSync():{};devtools=info.platform==='devtools';}catch(e){}
    const generation=this.markerGeneration;
    const fallback=()=>{
      if(this.disposed||generation!==this.markerGeneration)return;
      this.setData({latitude,longitude});
      // A single point also restores focus after a manual pan; never fit unrelated restaurants.
      if(this.mapCtx&&this.mapCtx.includePoints)try{this.mapCtx.includePoints({points:[{latitude,longitude}],padding:[90,40,165,40],success:()=>this.onCameraViewportReady(generation),fail:()=>{}});}catch(e){}
    };
    if(devtools||this.cameraMoveUnavailable||!this.mapCtx||!this.mapCtx.moveToLocation){fallback();return;}
    try {this.mapCtx.moveToLocation({latitude,longitude,success:()=>this.onCameraViewportReady(generation),fail:()=>{this.cameraMoveUnavailable=true;fallback();}});}
    catch(e){this.cameraMoveUnavailable=true;fallback();}
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
    // A fit moves the native centre without moving the bound props, and the scale
    // reply below re-asserts them: track the anchor to that same native viewport
    // first, or applying the new scale silently pulls the view back to the
    // previous centre. 单点聚焦与原生定位各自保留显式目标，不参与对齐。
    // 顺序保持既有可观察时序（本帧内同步刷新缩放与投影），锚点仅追加一次只读对齐。
    // 只对齐一次：由下面 syncStackPositions 已发起的那次 getRegion 回复消费，
    // 不额外查询、不新增定时器、不下发新的相机指令。
    this.cameraAnchorPending = reason === 'overview';
    this.rebindReadyMarkerPhotos();
    this.readMapScale();
    this.syncStackPositions();
  },

  // Project transparent hit regions only, once the native camera has settled.
  // Project real coordinates from the actual native viewport, never data.latitude.
  syncStackPositions() {
    if(!this.active||this.stackGesture||!this.mapCtx||!this.mapCtx.getRegion){this.cameraAnchorPending=false;return;}
    if(this.stackProjectionBusy){this.cameraAnchorPending=false;return;}
    this.stackProjectionBusy=true;
    const request=this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    const finish=()=>{if(request===this.stackPositionRequest)this.stackProjectionBusy=false;};
    this.mapCtx.getRegion({success:region=>{
      if(!this.active||this.disposed||request!==this.stackPositionRequest){finish();return;}
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
        this.setData(Object.assign({stackPositionsReady:Object.keys(positions).length>0},anchor));
        this.refreshStackFrame();finish();
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
      const targetOpen=this.data.clusterOpen&&g.memory.id===this.drawerRootId;
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
        overlayMode,transformDriver:staticFrame,overlayTop,overlayHeight,overlayRootTop,overlayToggleTop,overlayPageTop,
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
    // In view-overlay mode the cluster root is drawn by the native marker, so composing a
    // second copy for the drawer would be a wasted canvas job per cluster.
    const overlayMode=this.drawerOverlayMode();
    this.data.mapDrawers.forEach(drawer=>(overlayMode?[]:[drawer.root]).concat(drawer.targetOpen?drawer.rows:[]).forEach(pin=>{
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
      if(marker&&marker.customCallout&&marker.customCallout.anchorY!==d.calloutOffset)patch['markers['+d.markerId+'].customCallout.anchorY']=d.calloutOffset;
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
  onDrawerToggle(e) {
    const index=Number(e.currentTarget.dataset.index),g=this.markerGroups&&this.markerGroups[index];
    if(!g||g.members.length<2)return;
    const same=this.drawerRootId===g.memory.id;
    const from=same?this.drawerProgress||0:0;
    const open=!(same&&this.data.clusterOpen);
    this.stopDrawerReveal();this.drawerProgress=from;this.drawerRootId=g.memory.id;
    const transformDriver=this.drawerTransformDriver();
    this.setData({clusterOpen:open,drawerPage:same&&from>0?(this.data.drawerPage||0):0,clusterChoices:g.members.map(m=>({id:m.id,restaurant:m.restaurant,dateLabel:data.formatDate(m.date)}))});
    if(!this.active||this.data.quiet)this.drawerProgress=open?1:0;
    // A transform driver has no frame loop: progress IS the target state and the transition
    // supplies everything in between, so it must be set before the one rebuild below.
    if(transformDriver)this.drawerProgress=open?1:0;
    // Opening a drawer does not change restaurants, native markers or the camera.
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
  markerPhotoTarget(memoryId, source, selected) {
    if(this.markerPhotoSkipReason(memoryId,source,selected))return -1;
    return (this.markerGroups||[]).findIndex(g=>g.memory.id===memoryId);
  },
  // Why a finished photo may not be bound, in the vocabulary the device trace reports.
  // Same checks as markerPhotoTarget, but named so a real-device run can tell "the photo
  // never rendered" apart from "it rendered and the map was in a different state".
  markerPhotoSkipReason(memoryId, source, selected) {
    const groups=this.markerGroups||[];
    const index=groups.findIndex(g=>g.memory.id===memoryId);
    if(index<0)return 'superseded';
    // A cluster anchor is invisible under the native callout, so an individual photo must
    // never be painted onto it. Under the ordinary overlay the same marker IS the cluster's
    // visible root, and this is the only path that can hand it its photo.
    if(groups[index].members.length!==1&&!this.drawerOverlayMode())return 'clustered';
    const current=(this.data.markers||[])[index];
    if(!current||current.memoryId!==memoryId)return 'superseded';
    if(Boolean(current.stampSelected)!==Boolean(selected))return 'superseded';
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
    let changed=false;
    entries.forEach(entry=>{
      const index=markers.findIndex(m=>m.memoryId===entry.memoryId);
      if(index<0||markers[index].iconPath===entry.path)return;
      // A queued photo waits up to one frame before it is published, so re-check the
      // render variant: a selection change in that window must not bind the wrong stamp.
      if(entry.selected!==undefined&&Boolean(markers[index].stampSelected)!==Boolean(entry.selected)){
        this.traceMarker(entry.jobId,{applyResult:'superseded'});
        return;
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
  queueMarkerPhoto(memoryId,path,selected,jobId,stale) {
    if(!path)return;
    if(!this.markerPhotoPending)this.markerPhotoPending=new Map();
    this.markerPhotoPending.set(memoryId,{path:path,selected:Boolean(selected),jobId:jobId,stale:Boolean(stale)});
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
        jobId:entry.jobId,stale:Boolean(entry.stale)});
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
    pending.forEach((value,memoryId)=>entries.push({memoryId,path:value.path,selected:value.selected,jobId:value.jobId,stale:value.stale}));
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
    const groups=this.markerGroups||[],entries=[];
    groups.forEach((group,index)=>{
      if(group.members.length!==1)return;
      const current=(this.data.markers||[])[index];
      if(!current||current.memoryId!==group.memory.id)return;
      const path=this.pinRenderer.peek&&this.pinRenderer.peek(group.memory,current.stampSelected);
      if(!path||path===current.iconPath)return;
      // This is the rebound case by definition: a photo that was already composed but
      // never bound to the marker that still wants it. It gets its own trace token so a
      // device run can tell "composed late" apart from "composed but never published".
      entries.push({memoryId:group.memory.id,path:path,selected:current.stampSelected,stale:true,
        result:'ready-cache-rebound',
        jobId:this.pinRenderer.traceJobId&&this.pinRenderer.traceJobId(group.memory,current.stampSelected)});
    });
    return this.applyMarkerPhotos(entries);
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
    // the cluster's own marker is its visible root, so its representative joins the batch.
    const overlayMode=this.drawerOverlayMode();
    const ordered=visible.map((m,index)=>({m,index})).filter(({index})=>overlayMode||!this.markerGroups||this.markerGroups[index].members.length===1).sort((a,b)=>Number(b.m.id===selectedId)-Number(a.m.id===selectedId));
    const already=[];
    ordered.forEach(({m})=>{
      const selected=m.id===selectedId,source=mapMarkers.photoFor(m);
      const cached=renderer.peek&&renderer.peek(m,selected);
      if(cached){
        already.push({memoryId:m.id,path:cached,selected:selected,stale:true,
          jobId:renderer.traceJobId&&renderer.traceJobId(m,selected)});
        return;
      }
      const job=renderer.render(m,selected);
      job.then(path=>{
        const jobId=job&&job.traceJobId;
        if(!this.active || this.disposed || renderer!==this.pinRenderer) { this.traceMarker(jobId,{applyResult:'disposed'}); return; }
        if(this.stackGesture) { this.traceMarker(jobId,{applyResult:'gesture-deferred'}); return; }
        const skip=this.markerPhotoSkipReason(m.id,source,selected);
        if(skip) { this.traceMarker(jobId,{applyResult:skip}); return; }
        // A generation bump that left this marker unchanged must not cost it its photo.
        this.queueMarkerPhoto(m.id,path,selected,jobId,generation!==this.markerGeneration);
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
  onMapRegionChange(e) {
    const phase=e&&e.detail&&e.detail.type||e&&e.type;
    clearTimeout(this.stackAlignTimer);this.stackAlignTimer=null;
    this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    this.stackProjectionBusy=false;
    this.onStackRelease();
    // Only hit regions disappear. Native callouts stay anchored and visible.
    if(this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
    if(phase==='begin') {
      // A scale reply from before the gesture must never write camera props during it.
      this.scaleRequest=(this.scaleRequest||0)+1;
      this.stackGesture=true;
      if(this.drawerAnimating){this.drawerResumeTarget=this.data.clusterOpen?1:0;this.pauseDrawerReveal();}
      this.markerResumeNeeded=this.markerResumeNeeded||!!this.markerAnimation;this.stopMarkerAnimation();
      return;
    }
    this.stackGesture=false;
    // A gesture can bump the generation while photos are still composing; the region
    // end is exactly where those ready results must be bound. No polling timer.
    this.rebindReadyMarkerPhotos();
    this.readMapScale(e && e.detail && e.detail.scale);
    if(this.active&&!this.disposed) {
      this.stackAlignTimer=setTimeout(()=>{
        this.stackAlignTimer=null;
        if(!this.active||this.disposed||this.stackGesture)return;
        const state=this.deferredMapState;this.deferredMapState=null;
        if(state)this.syncState(store.get());
        else if(this.markerResumeNeeded)this.applyFilters(this.data.query,this.data.filter,this.data.selectedId,'preserve');
        this.markerResumeNeeded=false;
        this.syncStackPositions();
        this.rebindReadyMarkerPhotos();
        this.renderDrawerPhotos(this.markerGeneration);
        this.renderMarkerPhotos((this.markerGroups||[]).map(g=>g.memory),this.data.selectedId,this.markerGeneration);
        if(this.drawerResumeTarget!==undefined){const target=this.data.clusterOpen?1:0;this.drawerResumeTarget=undefined;if(Math.abs((this.drawerProgress||0)-target)>.001)this.startDrawerReveal(target);}
      },80);
    }
  },
  readMapScale(value) {
    if(!this.active || this.disposed || this.stackGesture) return;
    const request=this.scaleRequest=(this.scaleRequest||0)+1;
    const update=scale=>{
      if(!this.active || this.disposed || this.stackGesture || request!==this.scaleRequest || !Number.isFinite(scale) || Math.abs(scale-this.data.mapScale)<.05) return;
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
      if(!keepDrawer)this.stopDrawerReveal();
      this.setData(keepDrawer?{mapScale:nextScale}:{mapScale:nextScale,clusterOpen:false,drawerPage:0});
      this.applyFilters(this.data.query,this.data.filter,this.data.selectedId,'preserve');
    };
    if(Number.isFinite(value)) update(value);
    else if(this.mapCtx && this.mapCtx.getScale) this.mapCtx.getScale({success:r=>update(r.scale),fail:()=>{}});
  },
  onMarkerTap(event) {
    const index=event.detail.markerId,group=this.markerGroups && this.markerGroups[index];
    if(group && group.members.length>1) {
      if(this.data.clusterOpen&&this.drawerRootId===group.memory.id)this.selectMapMemory(group.memory.id,true);
      else this.onDrawerToggle({currentTarget:{dataset:{index}}});return;
    }
    const memoryId=this.visibleIds && this.visibleIds[index];
    if(memoryId) this.selectMapMemory(memoryId);
  },
  selectMapMemory(memoryId,keepDrawer) {
    if(!(this.allMemories||[]).some(m=>m.id===memoryId)) return;
    this.setData({selectedId:memoryId,cardCollapsed:false,clusterOpen:Boolean(keepDrawer&&this.data.clusterOpen)});
    this.applyFilters(this.data.query,this.data.filter,memoryId);
  },
  onClusterPick(e) { if(!this.data.clusterOpen)return;const id=e.currentTarget.dataset.id;if(!this.data.clusterChoices.some(m=>m.id===id))return;this.selectMapMemory(id,true); },
  onClusterClose() { const index=(this.markerGroups||[]).findIndex(g=>g.memory.id===this.drawerRootId);if(this.data.clusterOpen&&index>=0){this.onDrawerToggle({currentTarget:{dataset:{index}}});return;}this.stopDrawerReveal();this.setData({clusterOpen:false});this.refreshStackFrame(); },
  onTogglePlaceCard() { this.setData({cardCollapsed:!this.data.cardCollapsed}); },

  onQuery(event) {
    this.stopDrawerReveal();
    const query = event.detail.value;
    this.setData({ query: query, showFilters: false, clusterOpen:false });
    this.applyFilters(query, this.data.filter, this.data.selectedId);
  },

  onToggleFilters() {
    this.setData({ showFilters: !this.data.showFilters });
  },

  onFilterPick(event) {
    this.stopDrawerReveal();
    const value = event.currentTarget.dataset.value;
    this.setData({ filter: value, showFilters: false, clusterOpen:false });
    if (value === 'all' && !this.data.query) this.recenter();
    else this.applyFilters(this.data.query, value, this.data.selectedId);
  },

  recenter() {
    this.stopDrawerReveal();
    // An overview must not silently move the selection: keep the memory the
    // reader is on while it stays visible, so card and map agree afterwards.
    // visibleIds is the native marker-index mapping (roots only). A selected
    // drawer child is still visible while it belongs to a filtered marker group.
    const visibleChild = (this.markerGroups || []).some(g => (g.members || []).some(m => m.id === this.data.selectedId));
    const keep = (this.visibleIds || []).indexOf(this.data.selectedId) >= 0 || visibleChild
      ? this.data.selectedId : 'comptoir';
    this.setData({ query: '', filter: 'all', selectedId: keep, showFilters: false, clusterOpen:false });
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
