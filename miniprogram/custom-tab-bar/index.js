// UI-only native TabBar handoff. No business/store dependencies.
// Pages publish selection through showSelection; appearance refreshes cannot select a page.
let recentTabTransition=null;
let sharedAppearance=null;
let confirmedPresentation=null;
let transitionSerial=0;
let presentationSerial=0;
let instanceSerial=0;
const handoffTrace=[];
const tabInstances=new Set();
Component({
  data: {
    labels: ['Home', 'Map', 'Add', 'Us', 'Me'], addLabel: 'Add a memory',
    morphDuration: 480,
    selected: 0, transitionFrom: -1, entryKey: 0, entryActive:false, presentationReady:false, viewState:null,
    dusk: false,
    quiet: false,
    list: [
      { pagePath: '/pages/home/index', text: 'Home', icon: 'lucide-house', activeIcon: 'lucide-house-heart', rest: 'house', chosen: 'house-heart', size: 46 },
      { pagePath: '/pages/map/index', text: 'Map', icon: 'lucide-map', activeIcon: 'lucide-map-pinned', rest: 'map', chosen: 'map-pinned', size: 46 },
      { pagePath: '/pages/add/index', text: 'Add', add: true, icon: 'lucide-utensils', activeIcon: 'lucide-utensils-crossed', rest: 'utensils', chosen: 'utensils-crossed', size: 66 },
      { pagePath: '/pages/us/index', text: 'Us', icon: 'lucide-users', activeIcon: 'lucide-users-round', rest: 'users', chosen: 'users-round', size: 48 },
      { pagePath: '/pages/me/index', text: 'Me', icon: 'lucide-user', activeIcon: 'lucide-user-round', rest: 'user', chosen: 'user-round', size: 46 },
    ],
  },

  lifetimes:{attached(){this._instanceId=++instanceSerial;this._alive=true;tabInstances.add(this);this.seedTransition();},detached(){this._alive=false;tabInstances.delete(this);}},
  pageLifetimes:{show(){this.seedTransition();}},
  methods:{
    trace(event,detail){
      handoffTrace.push(Object.assign({at:Date.now(),event,bar:this._instanceId||0},detail||{}));
      if(handoffTrace.length>96)handoffTrace.splice(0,handoffTrace.length-96);
    },
    getTransitionTrace(){return handoffTrace.map(row=>Object.assign({},row));},
    getTransitionDebug(){const routeIndex=this.routeSelection();return {schema:'nav-independent-v1',bar:this._instanceId,route:routeIndex>=0?this.data.list[routeIndex].pagePath.replace(/^\//,''):null,routeIndex,selected:this.data.selected,entryKey:this.data.entryKey,entryActive:this.data.entryActive,diagnosticBuild:'render-handoff-v1',visualProbeBuild:'VP1',visualProbePage:this.getVisualProbePage(),trace:this.getTransitionTrace(),renderInstances:Array.from(tabInstances).map(b=>b.getRenderDiagnostics())};},
    getVisualProbePage(){
      try{const pages=getCurrentPages(),page=pages[pages.length-1];return page&&page.data&&page.data.visualProbe?Object.assign({},page.data.visualProbe):null;}catch(e){return null;}
    },
    getRenderDiagnostics(){
      const result={bar:this._instanceId,selected:this.data.selected,entryKey:this.data.entryKey,icons:[]};
      // Query only for an explicit user export. Never command/query-gate navigation.
      try{result.icons=(this.selectAllComponents('.tab-morph')||[]).map(c=>({index:c.dataset?Number(c.dataset.index):null,
        render:typeof c.getRenderDebug==='function'?c.getRenderDebug():null}));}
      catch(e){result.queryError=String(e&&e.message||e);}
      return result;
    },
    onMorphReport(event){
      const r=event.detail||{};
      this.trace('icon',{index:Number(event.currentTarget.dataset.index),key:r.entryKey==null?this.data.entryKey:r.entryKey,mode:r.mode,reason:r.reason,
        durationMs:r.durationMs,firstFrameWaitMs:r.firstFrameWaitMs,frameBudgetMs:r.frameBudgetMs});
    },
    routeSelection(){
      try{
        const pages=typeof getCurrentPages==='function'?getCurrentPages():[];
        const page=pages[pages.length-1],route=page&&page.route;
        return route&&this.data.list?this.data.list.findIndex(item=>item.pagePath==='/'+route):-1;
      }catch(e){return -1;}
    },
    transitionPatch(selected){
      const t=recentTabTransition;
      if(t&&t.to===Number(selected)&&Date.now()-t.at<5000)
        return {selected:Number(selected),transitionFrom:t.from,entryKey:t.id,entryActive:true,presentationReady:true};
      return {selected:Number(selected),transitionFrom:-1,entryKey:0,entryActive:true,presentationReady:true};
    },
    publish(patch,done){
      const next=Object.assign({},this.data,patch),revision=++presentationSerial;
      const icons=(next.list||[]).map((item,index)=>({
        revision,key:next.entryKey,active:next.entryActive,name:next.selected===index?item.chosen:item.rest,
        fromName:next.transitionFrom===index?item.chosen:item.rest,
        quiet:!!next.quiet,duration:480,
        color:item.add?(next.dusk?'#302a23':'#111510'):(next.selected===index?(next.dusk?'#dec8a7':'#171a16'):(next.dusk?'#a9a69f':'#828480'))
      }));
      // Parked peers change only the previous/current selected glyphs. Preserve
      // unchanged child commands so parking does not cause five redundant commits.
      if(next.entryActive===false&&this.data.viewState){icons.forEach((icon,index)=>{
        const old=this.data.viewState.icons[index];
        if(old&&['key','active','name','fromName','quiet','duration','color'].every(k=>old[k]===icon[k]))icons[index]=old;
      });}
      const viewState={revision,selected:next.selected,icons,probeBar:this._instanceId};this._viewRevision=revision;
      this.trace('publish',{revision,selected:next.selected,from:next.transitionFrom,key:next.entryKey,active:next.entryActive});
      // A single declarative input owns each child. Never remap a query result by array position.
      this.setData(Object.assign({},patch,{viewState}),()=>{
        if(this._alive!==false&&this._viewRevision===revision)this.trace('view-commit',{revision,selected:next.selected,key:next.entryKey});
        if(done)done();
      });
    },
    parkPresentation(selected){
      // Static current-page endpoints, not this cached page's last selected target.
      // from===to also keeps a later incoming handoff on the same visible geometry.
      if(this.data.presentationReady&&this.data.selected===selected&&this.data.entryActive===false&&this.data.entryKey===0)return;
      this.publish(Object.assign({},sharedAppearance||{},{selected,transitionFrom:selected,entryKey:0,entryActive:false,presentationReady:true}));
    },
    parkCachedPresentations(selected){
      // Called only by the page's explicit showSelection, after its route is current.
      // Never queried as a navigation gate; a failing cached view cannot block the live one.
      confirmedPresentation={bar:this,selected};
      for(const b of tabInstances){if(b===this||b._alive===false)continue;
        try{b.parkPresentation(selected);}catch(e){this.trace('park-error',{cachedBar:b._instanceId});}
      }
    },
    seedTransition(){
      const t=recentTabTransition,route=this.routeSelection();
      if(route<0)return;
      // Do not prepare the visible source with a destination state before navigation.
      if(t&&t.pending&&route===t.from)return;
      let page;try{const pages=getCurrentPages();page=pages[pages.length-1];}catch(e){}
      const appearance=sharedAppearance||(page&&page._tabAppearance);
      if(!appearance)return;
      // Precreated bars after a confirmed show inherit the CURRENT endpoint, not
      // the last transition's origin. They do not replay a hidden animation.
      if(confirmedPresentation&&confirmedPresentation.bar!==this&&confirmedPresentation.selected===route){
        this.parkPresentation(route);return;
      }
      // A new destination does not depend on an onShow callback that may already have run.
      this.publish(Object.assign({},this.appearancePatch(appearance),this.transitionPatch(route)));
    },
    showSelection(selected,appearance){
      selected=Number(selected);const t=recentTabTransition,route=this.routeSelection();
      if(t&&t.pending&&selected!==t.to){this.trace('reject-show',{selected,to:t.to});return false;}
      if(route>=0&&route!==selected&&!(t&&t.pending&&t.to===selected)){this.trace('reject-show',{selected,route});return false;}
      if(appearance)sharedAppearance=Object.assign({},sharedAppearance||{},this.appearancePatch(appearance));
      const patch=this.transitionPatch(selected);patch.entryActive=true;
      this.publish(Object.assign({},sharedAppearance||{},patch));
      if(route===selected)this.parkCachedPresentations(selected);
      return true;
    },
    appearancePatch(appearance){
      const patch={};for(const key of ['dusk','quiet','labels','addLabel'])if(appearance&&Object.prototype.hasOwnProperty.call(appearance,key))patch[key]=appearance[key];return patch;
    },
    updateAppearance(selected,appearance){
      const t=recentTabTransition,route=this.routeSelection();
      if((t&&t.pending&&Number(selected)!==t.to)||(route>=0&&route!==Number(selected)))return false;
      sharedAppearance=Object.assign({},sharedAppearance||{},this.appearancePatch(appearance));
      if(!this.data.presentationReady){this.seedTransition();return true;}
      this.publish(this.appearancePatch(appearance));return true;
    },
    replayTransition(){
      // Compatibility only: production pages no longer activate children from a late callback.
      const route=this.routeSelection();
      if(route>=0&&route!==Number(this.data.selected))return;
      this.showSelection(this.data.selected);
    },
    onTabTap(event){
      const to=Number(event&&event.currentTarget&&event.currentTarget.dataset.index);
      const route=this.routeSelection();
      this.trace('tap',{index:to,route,selected:this.data.selected});
      const item=Number.isInteger(to)&&this.data.list&&this.data.list[to];
      if(!item){this.trace('tap-rejected',{reason:'invalid-index',index:to});return;}
      // Visual selection, pending animation and inferred ownership are NOT navigation authority.
      if(route===to){this.trace('tap-noop',{reason:'already-on-route',index:to});return;}
      const from=route>=0?route:Number(this.data.selected);
      const t={from,to,at:Date.now(),id:++transitionSerial,pending:true};recentTabTransition=t;
      this.trace('switch',{from,to,key:t.id,prepareMs:Date.now()-t.at});
      try{
        wx.switchTab({url:item.pagePath,success:()=>{
          this.trace('switch-success',{key:t.id,to,route:this.routeSelection()});
          if(recentTabTransition===t)t.pending=false;
        },fail:error=>{
          this.trace('switch-failed',{key:t.id,to,reason:error&&error.errMsg||'native-navigation-failed'});
          if(recentTabTransition===t)recentTabTransition=null;
        }});
      }catch(error){
        this.trace('switch-failed',{key:t.id,to,reason:'synchronous-navigation-error'});
        if(recentTabTransition===t)recentTabTransition=null;
      }
    }
  }
});
