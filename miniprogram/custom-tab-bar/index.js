// UI-only native TabBar handoff. No business/store dependencies.
// Zero-Rewind Route-Owned architecture: each Tab WebView permanently renders its own
// route's active Lucide icon (matching its frozen GPU texture 100%) and triggers a
// 280ms GPU-composited Soft Tactile Spring on arrival.
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
    selected: 0, visualSelected: 0, transitionFrom: -1, entryKey: 0, entryActive: false, enterPulse: 0, presentationReady:false, viewState: null,
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
    getTransitionDebug(){const routeIndex=this.routeSelection();return {schema:'nav-independent-v1',bar:this._instanceId,route:routeIndex>=0?this.data.list[routeIndex].pagePath.replace(/^\//,''):null,routeIndex,selected:this.data.selected,entryKey:this.data.entryKey,entryActive:this.data.entryActive,enterPulse:this.data.enterPulse||0,diagnosticBuild:'render-handoff-v1',trace:this.getTransitionTrace(),renderInstances:Array.from(tabInstances).map(b=>b.getRenderDiagnostics())};},
    getRenderDiagnostics(){
      const result={bar:this._instanceId,selected:this.data.selected,entryKey:this.data.entryKey,enterPulse:this.data.enterPulse||0,icons:[]};
      // Query only for an explicit diagnostic export. Never query-gate navigation.
      try{result.icons=(this.selectAllComponents('.tab-s-icon')||[]).map((c,i)=>({index:c&&c.dataset&&c.dataset.index!=null?Number(c.dataset.index):i,src:c&&c.data&&c.data.src?true:false}));}
      catch(e){result.queryError=String(e&&e.message||e);}
      return result;
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
    // Everything that can change what the five icons & labels render. `revision` is deliberately NOT
    // part of it so repeated publishes with identical visual output collapse to one bridge call.
    visualPublishKey(next,icons){
      return JSON.stringify([!!next.presentationReady,next.labels,next.addLabel,next.selected,next.enterPulse||0,icons.map(icon=>({
        key:icon.key,active:icon.active,name:icon.name,icon:icon.icon||'',quiet:icon.quiet,color:icon.color
      }))]);
    },
    publish(patch,done){
      const next=Object.assign({},this.data,patch);
      next.visualSelected=next.selected;
      const animate=!next.quiet&&!!next.entryActive&&next.entryKey>0&&next.transitionFrom>=0&&next.transitionFrom!==next.selected;
      if(animate){
        if(this._lastAnimatedEntryKey!==next.entryKey){
          this._pulseToggle=this._pulseToggle===1?2:1;
          this._lastAnimatedEntryKey=next.entryKey;
        }
        next.enterPulse=this._pulseToggle;
      }else{
        next.enterPulse=0;
      }
      const addColor=next.dusk?'#302a23':'#111510';
      const compose=revision=>(next.list||[]).map((item,index)=>{
        const activeColor=item.add?addColor:(next.dusk?'#dec8a7':'#171a16');
        const inactiveColor=item.add?addColor:(next.dusk?'#a9a69f':'#828480');
        const active=next.selected===index;
        const name=active?item.chosen:item.rest;
        const icon=active?item.activeIcon:item.icon;
        const color=active?activeColor:inactiveColor;
        return {
          revision,key:next.entryKey,active:!!next.entryActive,name,icon,fromName:name,quiet:!!next.quiet,color,fromColor:color
        };
      });
      const visualKey=this.visualPublishKey(next,compose(0));
      if(this._publishedVisualKey===visualKey){
        this._publishSkipped=(this._publishSkipped||0)+1;
        this.trace('publish-skipped',{selected:next.selected,from:next.transitionFrom,key:next.entryKey,active:next.entryActive,pulse:next.enterPulse,skipped:this._publishSkipped});
        if(done)done();
        return false;
      }
      const revision=++presentationSerial;
      const icons=compose(revision);
      this._publishedVisualKey=visualKey;
      const viewState={revision,selected:next.selected,visualSelected:next.visualSelected,enterPulse:next.enterPulse,icons};
      this._viewRevision=revision;
      this.trace('publish',{revision,selected:next.selected,from:next.transitionFrom,key:next.entryKey,active:next.entryActive,pulse:next.enterPulse,visual:next.visualSelected});
      this.setData(Object.assign({},patch,{viewState,visualSelected:next.visualSelected,enterPulse:next.enterPulse}),()=>{
        if(this._alive!==false&&this._viewRevision===revision)this.trace('view-commit',{revision,selected:next.selected,key:next.entryKey,pulse:next.enterPulse});
        if(done)done();
      });
      return true;
    },
    getPublishDiagnostics(){return {published:this._publishedVisualKey!==undefined,skipped:this._publishSkipped||0};},
    seedTransition(){
      const t=recentTabTransition,route=this.routeSelection();
      if(route<0)return;
      // Do not prepare the visible source with a destination state before navigation.
      if(t&&t.pending&&route===t.from)return;
      let page;try{const pages=getCurrentPages();page=pages[pages.length-1];}catch(e){}
      const appearance=sharedAppearance||(page&&page._tabAppearance);
      if(!appearance)return;
      // Precreated bars after a confirmed show inherit the CURRENT endpoint, not a hidden bounce.
      if(confirmedPresentation&&confirmedPresentation.bar!==this&&confirmedPresentation.selected===route){
        this.publish(Object.assign({},this.appearancePatch(appearance),{selected:route,transitionFrom:route,entryKey:0,entryActive:false,presentationReady:true}));
        return;
      }
      this.publish(Object.assign({},this.appearancePatch(appearance),this.transitionPatch(route)));
    },
    showSelection(selected,appearance){
      selected=Number(selected);const t=recentTabTransition,route=this.routeSelection();
      if(t&&t.pending&&selected!==t.to){this.trace('reject-show',{selected,to:t.to});return false;}
      if(route>=0&&route!==selected&&!(t&&t.pending&&t.to===selected)){this.trace('reject-show',{selected,route});return false;}
      if(appearance)sharedAppearance=Object.assign({},sharedAppearance||{},this.appearancePatch(appearance));
      if(route===selected)confirmedPresentation={bar:this,selected};
      this.publish(Object.assign({},sharedAppearance||{},this.transitionPatch(selected)));
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
      if(!this.data.quiet&&typeof wx!=='undefined'&&wx&&typeof wx.vibrateShort==='function'){try{wx.vibrateShort({type:'light'});}catch(e){}}
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
