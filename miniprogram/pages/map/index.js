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

Page({
  onFieldFocus: uiFeedback.onFieldFocus,
  onFieldBlur: uiFeedback.onFieldBlur,
  data: {
    focusedField: '', imageErrors: {}, pressedStackRoot:'',
    copy: i18n.copy(), locale: i18n.locale(),
    latitude: 48.8535, longitude: 2.3392,
    pendingCount: 0, demoMode: true, pendingExpanded: false,
    headerTop: 54,
    overlayTop: 174,
    query: '',
    filter: 'all',
    showFilters: false,
    selectedId: 'comptoir',
    dusk: false,
    quiet: false,
    markers: [],
    stackPositionsReady:false, mapScale:13, cardCollapsed:false, clusterOpen:false, clusterChoices:[], mapDrawers:[], drawerPage:0,
    resultsCount: 0,
    selected: null,
    selectedPhoto: '',
    distanceLabel: '',
    mapError: false,
  },

  onLoad() {
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
  initMarkerRenderer() {
    if(this.active && this.markerCanvas && !this.pinRenderer) {
      try {this.pinRenderer=mapMarkers.createRenderer(this.markerCanvas);} catch(e) { /* bundled fallback remains usable */ }
    }
  },
  onResize() { const m=metrics.getMetrics(true); this.setData({headerTop:m.headerTop,overlayTop:m.headerTop+120},()=>this.syncStackPositions()); },
  onHide() {
    this.markerCanvasRequest=(this.markerCanvasRequest||0)+1;this.markerCanvasPending=false;
    this.onStackRelease();
    this.stackGesture=false;clearTimeout(this.stackAlignTimer);this.stackAlignTimer=null;
    this.stackProjectionBusy=false;
    this.stackPositionRequest=(this.stackPositionRequest||0)+1;
    this.stopMarkerAnimation();
    this.stopDrawerReveal();
    this.setData({clusterOpen:false,mapDrawers:[],stackPositionsReady:false});
    this.deferredMapState=null;this.drawerResumeTarget=undefined;this.markerResumeNeeded=false;
    this.active=false;this.markerGeneration=(this.markerGeneration||0)+1;
    if(this.pinRenderer) this.pinRenderer.dispose();this.pinRenderer=null;
  },
  onUnload() {
    this.disposed=true;this.onHide();
    if (this.unsubscribe) this.unsubscribe();
  },

  onShow() {
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
      if(groups[index].members.length>1){target.width=1;target.height=1;target.iconPath='/images/markers/stack-anchor.png';target.anchor={x:0.5,y:1};}
      target.width=Math.max(1,Math.round(Number(target.width)||48));
      target.height=Math.max(1,Math.round(Number(target.height)||54));
      return Object.assign({
        stampSelected:isSelected, groupCount:groups[index].members.length,
        label:undefined,
        customCallout:groups[index].members.length>1?{display:'ALWAYS',anchorX:0,anchorY:0}:undefined,
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
      selected: selected ? Object.assign({}, selected, { dateLabel: data.formatDate(selected.date),categoryLabel:restaurantCategory.summary(selected)||i18n.t('Category not recorded') }) : null,
      selectedPhoto: selected ? (selected.placePhoto || selected.photo || data.photos.meal) : '',
      selectedSaved: Boolean(selected && selected.saved),
      distanceLabel: distanceLabel,
    };
    if (shouldFocus && viewportMode !== 'overview') {
      patch.latitude = selected.coordinates[0]; patch.longitude = selected.coordinates[1];
    }
    // Wait for the marker/card update before issuing one camera command.
    // A native pan need not update data.latitude: explicit focus also handles
    // tapping the same marker again after panning away.
    this.setData(patch, () => {
      this.ensureMarkerRenderer();
      this.syncStackPositions();
      this.animateMarkerSizes(animation,generation);
      this.renderMarkerPhotos(representatives, selected && selected.id, generation);
      this.renderDrawerPhotos(generation);
      if (!this.mapCtx) return;
      if (viewportMode === 'overview' && visible.length) {
        const points = visible.map(m => ({latitude:m.coordinates[0], longitude:m.coordinates[1]}));
        try {this.mapCtx.includePoints({ points, padding: [90, 40, 165, 40],fail:()=>{} });}catch(e){/* Existing viewport remains usable. */}
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
      if(this.mapCtx&&this.mapCtx.includePoints)try{this.mapCtx.includePoints({points:[{latitude,longitude}],padding:[90,40,165,40],fail:()=>{}});}catch(e){}
    };
    if(devtools||this.cameraMoveUnavailable||!this.mapCtx||!this.mapCtx.moveToLocation){fallback();return;}
    try {this.mapCtx.moveToLocation({latitude,longitude,fail:()=>{this.cameraMoveUnavailable=true;fallback();}});}
    catch(e){this.cameraMoveUnavailable=true;fallback();}
  },
  // Project transparent hit regions only, once the native camera has settled.
  // Project real coordinates from the actual native viewport, never data.latitude.
  syncStackPositions() {
    if(!this.active||this.stackGesture||!this.mapCtx||!this.mapCtx.getRegion)return;
    if(this.stackProjectionBusy)return;
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
        this.setData({stackPositionsReady:Object.keys(positions).length>0});
        this.refreshStackFrame();finish();
      }).exec();
    },fail:finish});
  },
  buildDrawers(groups,markers,selectedId) {
    const windowWidth=metrics.getMetrics().screenWidth;
    return groups.map((g,index)=>{
      if(g.members.length<2)return null;
      const targetOpen=this.data.clusterOpen&&g.memory.id===this.drawerRootId;
      const progress=g.memory.id===this.drawerRootId?this.drawerProgress||0:0;
      const open=targetOpen||progress>0;
      const others=g.members.filter(m=>m.id!==g.memory.id),pages=Math.ceil(others.length/3);
      const page=Math.max(0,Math.min(this.data.drawerPage||0,pages-1));
      const buttonBox=mapStack.buttonGeometry(windowWidth,pages===1);
      // Keep native callout bounds fixed while the logical 320ms frame moves.
      // Full page capacity also prevents the shorter last page moving the root.
      const bounds=mapStack.layout(Math.min(3,others.length),1),reserve=pages>1?28:0;
      const frameHeight=bounds.height+reserve,frameRootTop=bounds.rootTop+reserve;
      const members=others.slice(page*3,page*3+3),frame=mapStack.layout(open?members.length:0,progress);
      const photo=m=>{
        const selected=m.id===selectedId;
        return {id:m.id,selected,iconPath:this.pinRenderer&&this.pinRenderer.peek&&this.pinRenderer.peek(m,selected)||mapMarkers.style(selected).iconPath};
      };
      if(pages>1){const extra=Math.round(28*progress);frame.height+=extra;frame.rootTop+=extra;frame.slots.forEach(slot=>{slot.top+=extra;});}
      const rows=open?members.map((m,j)=>Object.assign(photo(m),frame.slots[j],{layer:members.length-j})).reverse():[];
      const pos=(this.stackPositions||{})[g.memory.id]||{x:0,y:0};
      return {frameHeight,frameRootTop,buttonBox,progress,screenX:pos.x-44,screenY:pos.y,markerId:index,rootId:g.memory.id,root:photo(g.memory),rootTop:frame.rootTop,height:frame.height,open,targetOpen,rows,count:g.members.length,page,pages};
    }).filter(Boolean);
  },
  renderDrawerPhotos(generation) {
    if(!this.pinRenderer||!this.active||this.stackGesture)return;
    const renderer=this.pinRenderer,tasks=[];
    this.data.mapDrawers.forEach(drawer=>[drawer.root].concat(drawer.rows).forEach(pin=>{
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
    this.setData({mapDrawers:this.buildDrawers(this.markerGroups||[],this.data.markers,this.data.selectedId)},done);
  },
  patchDrawerFrame(progress,done) {
    const index=this.data.mapDrawers.findIndex(d=>d.rootId===this.drawerRootId);
    if(index<0){if(done)done();return;}
    const d=this.data.mapDrawers[index],frame=mapStack.layout(d.rows.length,progress);
    if(d.pages>1){const extra=Math.round(28*progress);frame.height+=extra;frame.rootTop+=extra;frame.slots.forEach(slot=>slot.top+=extra);}
    const base='mapDrawers['+index+']',patch={};
    const set=(key,value)=>{patch[base+'.'+key]=value;};
    set('progress',progress);set('height',frame.height);set('rootTop',frame.rootTop);
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
    this.setData({clusterOpen:open,drawerPage:same&&from>0?(this.data.drawerPage||0):0,clusterChoices:g.members.map(m=>({id:m.id,restaurant:m.restaurant,dateLabel:data.formatDate(m.date)}))});
    if(!this.active||this.data.quiet)this.drawerProgress=open?1:0;
    // Opening a drawer does not change restaurants, native markers or the camera.
    this.refreshStackFrame(()=>{
      if(this.active&&!this.data.quiet)this.startDrawerReveal(open?1:0);
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
    this.drawerAnimating=true;
    const valid=()=>this.active&&!this.disposed&&!this.stackGesture&&this.drawerRootId===root&&this.drawerRun===run;
    const step=()=>{
      this.drawerRevealTimer=null;
      if(!valid())return;
      const t=Math.min(1,(Date.now()-start)/duration);
      this.drawerProgress=from+(target-from)*mapStack.ease(t);
      // One frame in flight: native callouts never receive a backlog of whole arrays/photos.
      this.patchDrawerFrame(this.drawerProgress,()=>{
        if(!valid())return;
        if(t<1)this.drawerRevealTimer=setTimeout(step,16);
        else {this.drawerAnimating=false;if(target===0)this.refreshStackFrame();}
      });
    };
    this.drawerRevealTimer=setTimeout(step,16);
  },
  onDrawerPage(e) {
    if(!this.data.clusterOpen)return;
    const d=this.data.mapDrawers.find(d=>d.open);if(!d)return;
    this.stopDrawerReveal();this.drawerProgress=1;
    this.setData({drawerPage:(d.page+Number(e.currentTarget.dataset.step)+d.pages)%d.pages});
    this.refreshStackFrame(()=>this.renderDrawerPhotos(this.markerGeneration));
  },
  onStackRoot(e) {this.selectMapMemory(e.currentTarget.dataset.id,this.data.clusterOpen);},
  renderMarkerPhotos(visible, selectedId, generation) {
    if (!this.pinRenderer || !this.active || this.stackGesture) return;
    const renderer=this.pinRenderer;
    // Priority to the selected photo; others have a bounded enhancement budget.
    const ordered=visible.map((m,index)=>({m,index})).filter(({index})=>!this.markerGroups||this.markerGroups[index].members.length===1).sort((a,b)=>Number(b.m.id===selectedId)-Number(a.m.id===selectedId)).slice(0,48);
    ordered.forEach(({m,index})=>{
      const current=this.data.markers[index],cached=renderer.peek&&renderer.peek(m,m.id===selectedId);
      if(current&&cached===current.iconPath)return;
      renderer.render(m,m.id===selectedId).then(path=>{
        if(!this.active || this.disposed || this.stackGesture || generation!==this.markerGeneration || renderer!==this.pinRenderer) return;
        if(!this.data.markers[index] || this.data.markers[index].memoryId!==m.id) return;
        if(this.data.markers[index].iconPath===path)return;
        const markers=this.data.markers.map((marker,i)=>i===index?Object.assign({},marker,{iconPath:path}):Object.assign({},marker));
        this.setData({markers});
      }).catch(()=>{});
    });
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
      this.stackGesture=true;
      if(this.drawerAnimating){this.drawerResumeTarget=this.data.clusterOpen?1:0;this.pauseDrawerReveal();}
      this.markerResumeNeeded=this.markerResumeNeeded||!!this.markerAnimation;this.stopMarkerAnimation();
      return;
    }
    this.stackGesture=false;
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
        this.renderDrawerPhotos(this.markerGeneration);
        this.renderMarkerPhotos((this.markerGroups||[]).map(g=>g.memory),this.data.selectedId,this.markerGeneration);
        if(this.drawerResumeTarget!==undefined){const target=this.data.clusterOpen?1:0;this.drawerResumeTarget=undefined;if(Math.abs((this.drawerProgress||0)-target)>.001)this.startDrawerReveal(target);}
      },80);
    }
  },
  readMapScale(value) {
    if(!this.active) return;
    const request=this.scaleRequest=(this.scaleRequest||0)+1;
    const update=scale=>{
      if(!this.active || request!==this.scaleRequest || !Number.isFinite(scale) || Math.abs(scale-this.data.mapScale)<.05) return;
      const nextScale=Math.max(3,Math.min(18,scale));
      const rootId=(this.data.clusterOpen||this.drawerProgress>0)?this.drawerRootId:this.data.selectedId;
      const groups=mapLayout.group(visibleMemories(this.allMemories||[],this.data.query,this.data.filter),nextScale,rootId);
      const same=(a,b)=>!!a&&!!b&&a.memory.id===b.memory.id&&a.members.length===b.members.length&&a.members.every((m,i)=>m.id===b.members[i].id);
      const previous=this.markerGroups||[];
      // A camera scale update is not a new restaurant selection or a drawer-close intent.
      // Keep native callouts/photos mounted when grouping did not change.
      if(groups.length===previous.length&&groups.every((g,i)=>same(g,previous[i]))) {
        this.setData({mapScale:nextScale});
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
    this.setData({ query: '', filter: 'all', selectedId: 'comptoir', showFilters: false, clusterOpen:false });
    this.applyFilters('', 'all', 'comptoir', 'overview');
  },

  onEmptyMapAction() { if (this.data.pendingCount) this.onFillLocation(); else this.recenter(); },

  onTogglePending() { this.setData({ pendingExpanded: !this.data.pendingExpanded }); },
  onCollapsePending() { this.setData({ pendingExpanded: false }); },

  onFillLocation() {
    if (this.locationBusy || !this.pendingLocations.length) return;
    this.setData({ pendingExpanded: false });
    const batch = this.pendingLocations.slice(0, 6);
    const token=identity.lease();
    wx.showActionSheet({ itemList: batch.map(m => (m.restaurant + ' · ' + m.date).slice(0, 48)),
      success: result => {if(identity.isCurrent(token))this.pickLocationFor(batch[result.tapIndex]);} });
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
    const selected = this.data.selected;
    if (!selected) return;
    this.setData({ sheetShow: true, sheetType: 'memory', sheetMemoryId: selected.id, sheetFilter: '' });
  },

  onBookmark() {
    const selected = this.data.selected;
    if (!selected) return;
    store.updateMemory(selected.id, { saved: !selected.saved });
    store.notify(selected.saved ? i18n.t('Place removed from your favorites.') : i18n.t('A good place to come back to. Saved.'));
  },

  onClearSearch() {
    this.recenter();
  },

  onSheetChange(event) {
    this.setData({
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },

  onSheetClose() {
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
});
