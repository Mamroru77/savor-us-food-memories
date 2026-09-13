const {frameSvg}=require('../../utils/morphSvg');
const {iconSvg}=require('../../utils/icons');
let engine=null;
let diagnosticSerial=0;
try{engine=require('../../utils/morphEngine');}catch(e){/* Static SVG fallback remains available. */}
Component({
  properties:{presentation:{type:Object,value:null},nativeProbe:{type:Boolean,value:false},entryActive:{type:Boolean,value:true},duration:{type:Number,value:380},renderer:{type:String,value:'canvas'},fromName:{type:String,value:''},entryKey:{type:Number,value:0},name:{type:String,value:'house'},size:{type:Number,value:112},color:{type:String,value:'#34483c'},quiet:{type:Boolean,value:false}},
  data:{viewCommand:null,renderRevision:0,fallbackOnly:false,settledEntryKey:0,staticName:'',ready:false,painting:false,frameSrc:'',frameVisible:false,loadingSrc:'',frameSlots:[]},
  observers:{presentation:function(command){if(command)this.acceptPresentation(command);},'name, quiet, color, fromName, entryKey':function(){
    if(this._acceptedCommand||this.data.presentation)return;
    const signature=JSON.stringify([this.data.name,this.data.quiet,this.data.color,this.data.fromName,this.data.entryKey]);
    if(signature===this._inputSignature)return;
    this._inputSignature=signature;
    if(this._alive&&(this._ctx||this._svgReady))this.move();
  },'entryActive':function(){
    if(this._acceptedCommand||this.data.presentation)return;
    if(this.data.entryActive===false){
      this.cancel();this.clearSurface();
      if(this._alive)this.setData({painting:false,frameSrc:'',frameVisible:false,loadingSrc:'',frameSlots:[]});
    } else if(this._alive&&(this._ctx||this._svgReady))this.move();
  }},
  lifetimes:{
    attached(){if(!this._diagnosticId)this._diagnosticId=++diagnosticSerial;this._alive=true;this.recordRender('attached');if(this.data.presentation)this.acceptPresentation(this.data.presentation);},
    ready(){this.setup();},
    detached(){this.recordRender('detached');this._alive=false;const pending=this._commandWaiters||[];this._commandWaiters=[];pending.forEach(fn=>fn());this.cancel();this.clearSurface();this._svgReady=false;this._ctx=null;this._canvas=null;}
  },
  pageLifetimes:{hide(){this.recordRender('page-hide');this._hiddenAfterRevision=this._acceptedCommand?this._acceptedCommand.revision:0;this._hidden=true;this.cancel();this.clearSurface();this.setData({painting:false,frameSrc:''});},show(){this.recordRender('page-show');this._rafStalled=false;if(this.data.renderer==='svg')return;this._hidden=false;if(this._ctx&&!this.data.painting)this.move(!this.data.entryKey);}},
  methods:{
    renderSnapshot(){
      const d=this.data,v=d.viewCommand,c=this._acceptedCommand,m=this._svgMotion;
      const target=v&&(v.quiet||d.fallbackOnly||!v.key||(v.active&&d.settledEntryKey===v.key));
      const frame=!!(v&&v.active&&d.renderRevision===v.revision&&d.painting&&d.frameSrc&&d.frameVisible);
      return {at:Date.now(),icon:this._diagnosticId||0,key:c?c.key:0,revision:c?c.revision:0,
        viewRevision:v?v.revision:0,committedRevision:this._commandCommitted||0,renderRevision:d.renderRevision,
        from:v?v.fromName:null,to:v?v.name:null,staticEndpoint:v?(target?v.name:v.fromName):null,
        logicalLayer:frame?'frame':v?'static':'unbound',fallbackOnly:!!d.fallbackOnly,
        settledKey:d.settledEntryKey,setup:!!this._setupComplete,svgReady:!!this._svgReady,
        hidden:!!this._hidden,active:!!(v&&v.active),pending:!!this._commandNeedsMove,
        generation:this._generation||0,motionStarted:!!(m&&m.started),elapsed:m?m.elapsed:null};
    },
    recordRender(stage,detail){
      // Local bounded JS records only: no setData, event bridge, console or frame URI.
      // Logical layer is NOT proof of what the native compositor has displayed.
      const rows=this._renderDiagnostics||(this._renderDiagnostics=[]);
      rows.push(Object.assign(this.renderSnapshot(),{stage},detail||{}));
      if(rows.length>64)rows.splice(0,rows.length-64);
    },
    getRenderDebug(){return {snapshot:this.renderSnapshot(),trace:(this._renderDiagnostics||[]).map(r=>Object.assign({},r)),
      frameMetrics:this._frameMetrics?Object.assign({},this._frameMetrics):null};},
    staticLoaded(event){
      const c=this._acceptedCommand,v=this.data.viewCommand;
      if(!c||!v||this._alive===false)return;
      const target=c.quiet||this.data.fallbackOnly||!c.key||(c.active&&this.data.settledEntryKey===c.key);
      const expected=target?v.targetSrc:v.originSrc;
      const loaded=event.currentTarget.dataset.src;
      this.recordRender('static-load',{callbackRevision:Number(event.currentTarget.dataset.revision)||0,
        loadedEndpoint:loaded===v.originSrc?v.fromName:loaded===v.targetSrc?v.name:'other-uri',accepted:loaded===expected});
      // Image nodes are keyed by immutable URI. An older revision loading the SAME
      // endpoint is valid; a different old bitmap cannot release this command.
      if(event.currentTarget.dataset.src!==expected){this.triggerEvent('report',{mode:'static-load-ignored',entryKey:c.key,reason:'source-mismatch'});return;}
      this._loadedStaticSrc=expected;
      this.triggerEvent('report',{mode:'static-loaded',entryKey:c.key});
      this.finishCommandCommit();
    },
    staticError(event){
      const c=this._acceptedCommand;
      if(!c||Number(event.currentTarget.dataset.revision)!==c.revision||this._alive===false)return;
      this._staticErrorRevision=c.revision;this.canvasError('svg-static-unavailable');this.finishCommandCommit();
    },
    finishCommandCommit(){
      const command=this._acceptedCommand;
      if(!command||this._commandViewCommitted!==command.revision||this._commandCommitted===command.revision)return;
      const v=this.data.viewCommand;
      const target=command.quiet||this.data.fallbackOnly||!command.key||(command.active&&this.data.settledEntryKey===command.key);
      const src=target?v.targetSrc:v.originSrc;
      if(this._loadedStaticSrc!==src&&this._staticErrorRevision!==command.revision)return;
      this._commandCommitted=command.revision;this.recordRender('command-ready');
      if(this._staticWaitTimer!=null)clearTimeout(this._staticWaitTimer);this._staticWaitTimer=null;
      const pending=this._commandWaiters||[];this._commandWaiters=[];pending.forEach(fn=>fn());
      this.startCommittedCommand();
    },
    startCommittedCommand(){
      const command=this._acceptedCommand;
      if(!command||this._commandCommitted!==command.revision||!this._alive||!command.active)return;
      if(this._hidden&&command.revision<=(this._hiddenAfterRevision||0))return;
      const wasHidden=this._hidden;this._hidden=false;
      if((this._commandNeedsMove||wasHidden)&&(this._ctx||this._svgReady)){
        // Consume the request only when the renderer can actually handle it.
        // Same-visual publications while load/ready is pending must not erase it.
        this._commandNeedsMove=false;this.move(!command.key);
      }
    },
    acceptPresentation(command,done){
      if(!command||!Number.isFinite(command.revision)){if(done)done();return;}
      const old=this._acceptedCommand;
      if(old&&command.revision<=old.revision){
        // The declarative observer may have sent the update before the parent's callback.
        // Its acknowledgment must wait for that SAME child commit, not merely VM data.
        if(this._commandCommitted===old.revision){if(done)done();}
        else if(done)(this._commandWaiters||(this._commandWaiters=[])).push(done);
        return;
      }
      this.recordRender('command-received',{nextRevision:command.revision,nextKey:command.key,nextFrom:command.fromName,nextTo:command.name});
      this._commandWaiters=this._commandWaiters||[];
      this._acceptedCommand=command;if(done)this._commandWaiters.push(done);
      const sameEntry=old&&old.key===command.key;
      const sameVisual=sameEntry&&old.name===command.name&&old.fromName===command.fromName&&old.quiet===command.quiet&&old.color===command.color&&old.active===command.active;
      if(!sameVisual){if(sameEntry&&this.data.painting&&this._displayed&&engine)this._current=engine.copy(this._displayed);this.cancel();this.clearSurface();}
      const viewCommand=Object.assign({},command,{probeIcon:this._diagnosticId||(this._diagnosticId=++diagnosticSerial),originSrc:iconSvg(command.fromName,{stroke:command.color,strokeWidth:1.75}),targetSrc:iconSvg(command.name,{stroke:command.color,strokeWidth:1.75})});
      const patch={viewCommand,name:command.name,fromName:command.fromName,entryKey:command.key,
        entryActive:command.active,quiet:command.quiet,color:command.color,duration:command.duration};
      if(!sameVisual)Object.assign(patch,{painting:false,frameSrc:'',frameVisible:false,loadingSrc:'',frameSlots:[]});
      // Bind the entire logical state and its fallback in ONE child view update.
      // Stale frame commits retain their old renderRevision and cannot cover this command.
      if(sameVisual)patch.renderRevision=command.revision;
      this._commandNeedsMove=!sameVisual||this._commandNeedsMove===true;
      if(this._staticWaitTimer!=null)clearTimeout(this._staticWaitTimer);
      this.armStaticWait();
      this.setData(patch,()=>{
        if(this._acceptedCommand!==command)return;
        this._commandViewCommitted=command.revision;this.recordRender('view-commit');this.finishCommandCommit();
      });
    },
    armStaticWait(){
      // An attached/precreated icon may not have reached ready yet. Its image
      // cannot be judged missing until the renderer lifecycle is actually ready.
      const command=this._acceptedCommand;
      if(!this._setupComplete||!command||!command.active||!this._alive||this._hidden||this.data.fallbackOnly||this._commandCommitted===command.revision)return;
      if(this._staticWaitTimer!=null)clearTimeout(this._staticWaitTimer);
      this._staticWaitTimer=setTimeout(()=>{
        this._staticWaitTimer=null;
        if(this._alive&&!this._hidden&&this._acceptedCommand===command&&this._commandCommitted!==command.revision){
          this._staticErrorRevision=command.revision;this.canvasError('svg-static-timeout');this.finishCommandCommit();
        }
      },1200);
    },
    // Page onShow explicitly reactivates cached TabBar icons after props commit.
    replay(key){
      if(!this._alive)return;
      const wasHidden=this._hidden;this._hidden=false;
      if(this._replayedKey===key&&!wasHidden)return;
      this._replayedKey=key;this._rafStalled=false;
      // Props may already have started this entry. Do not reseed/rekey its image.
      if(this._ctx||this._svgReady)this.move();
    },
    resume(){
      if(!this._alive)return;
      this._hidden=false;this._rafStalled=false;
      if(this._ctx||this._svgReady)this.move(true);
    },
    setup(){
      this.recordRender('setup-enter');      if(!engine){this.canvasError();return;}
      if(this.data.renderer==='svg'){
        this._setupComplete=true;
        // Genuine renderer/image failure is terminal for this instance. A late
        // ready callback must not animate from an origin after fallback showed target.
        if(this.data.fallbackOnly)return;
        this._svgReady=true;this.setData({ready:true});this.armStaticWait();
        if(this._acceptedCommand)this.startCommittedCommand();else this.move(!this.data.entryKey);return;
      }
      this.createSelectorQuery().select('#morph-canvas').fields({node:true,size:true}).exec(result=>{
        if(!this._alive)return;
        try{
          const r=result&&result[0];if(!r||!r.node||!r.width||!r.height)throw new Error('Canvas unavailable');
          this._canvas=r.node;this._ctx=r.node.getContext('2d');if(!this._ctx)throw new Error('Context unavailable');
          const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
          const ratio=Math.min(3,info.pixelRatio||1);r.node.width=Math.round(r.width*ratio);r.node.height=Math.round(r.height*ratio);
          this.setData({ready:true});this.move(!this.data.entryKey);
        }catch(e){this.canvasError();}
      });
    },
    svgLoaded(event){
      const motion=this._svgMotion;
      const generation=Number(event&&event.currentTarget&&event.currentTarget.dataset.generation);
      if(!motion||generation!==motion.generation||generation!==this._generation||!this._alive||this._hidden)return;
      motion.loaded=true;this.beginSvg();
    },
    beginSvg(){
      const m=this._svgMotion;
      if(!m||m.started||!m.loaded||!m.committed||m.generation!==this._generation||!this._alive||this._hidden)return;
      m.started=true;clearTimeout(this._firstFrameTimer);this._firstFrameTimer=null;
      this.setData({frameVisible:true,loadingSrc:''},()=>{
        if(this._svgMotion!==m||!this._alive||this._hidden)return;
        m.visibleAt=Date.now();this.recordRender('first-frame-reveal-commit');this.triggerEvent('report',{mode:'start',entryKey:m.entryKey,name:this.data.name,requestedDurationMs:m.duration});m.next();
      });
    },
    startSvg(state,planMs){
      const generation=this._generation;
      const duration=Math.max(160,Math.min(1200,Number(this.data.duration)||380));
      const m={generation,entryKey:this.data.entryKey,duration,elapsed:0,frames:0,queuedAt:Date.now(),visibleAt:null,loaded:false,committed:false,started:false};
      this._svgMotion=m;this._frameMetrics={frames:0,encodeTotalMs:0,encodeMaxMs:0,commitTotalMs:0,commitMaxMs:0,intervalMaxMs:0};this.recordRender('motion-created');
      const valid=()=>this._alive&&!this._hidden&&this._svgReady&&this._generation===generation&&this._svgMotion===m;
      const finish=()=>{
        if(!valid())return;
        this._current=engine.copy(engine.sample(state.name));this._settledName=state.name;
        this.recordRender('motion-finish');this._displayed=null;this._svgFlight=null;this._svgMotion=null;
        this.setData({settledEntryKey:m.entryKey,staticName:state.name,painting:false,frameSrc:'',frameVisible:false,loadingSrc:'',frameSlots:[]});
        this.triggerEvent('report',{mode:'complete',entryKey:m.entryKey,name:state.name,frames:m.frames,durationMs:Date.now()-m.visibleAt,requestedDurationMs:duration,firstFrameWaitMs:m.visibleAt-m.queuedAt,planMs,scheduler:'svg-timer',clock:'first-image-load',timing:'wall-clock',frameBudgetMs:m.elapsed});
      };
      const send=first=>{
        if(!valid())return;
        try{
          const t=m.elapsed/duration,ease=t*t*(3-2*t);
          this._current=engine.copy(engine.frame(state,ease));m.frames++;
          this.paint(this._current,()=>{
            if(!valid())return;
            if(first){m.committed=true;this.beginSvg();}
            else if(m.elapsed>=duration)finish();
            else m.next();
          },first);
        }catch(e){this.canvasError();}
      };
      m.next=()=>{
        if(!valid())return;
        // Deadline is anchored to first-frame reveal, not the previous callback.
        // Keep one outstanding frame; after a slow commit, skip overdue samples
        // rather than adding another full delay and stretching the whole morph.
        const now=Math.max(m.elapsed,Date.now()-m.visibleAt);
        const due=Math.min(duration,(Math.floor(now/32)+1)*32);
        this._timer=setTimeout(()=>{
          this._timer=null;if(!valid())return;
          m.elapsed=Math.min(duration,Math.max(m.elapsed,Date.now()-m.visibleAt));send(false);
        },Math.max(0,due-now));
      };
      this._firstFrameTimer=setTimeout(()=>{
        if(valid()&&!m.started)this.canvasError('svg-first-frame-timeout');
      },1200);
      send(true);
    },
    svgError(event){const id=event&&event.currentTarget&&event.currentTarget.dataset.generation;if(id!=null&&Number(id)!==this._generation)return;if(this.data.renderer==='svg'&&this.data.painting)this.canvasError();},
    canvasError(reason){this.recordRender('fallback-enter',{reason:typeof reason==='string'?reason:'renderer-error'});this.cancel();this.clearSurface();this._ctx=null;this._svgReady=false;if(this._alive){this.setData({fallbackOnly:true,settledEntryKey:this.data.entryKey,staticName:this.data.name,ready:false,painting:false,frameSrc:''});this.triggerEvent('report',{mode:'static-fallback',entryKey:this.data.entryKey,reason:typeof reason==='string'?reason:this.data.renderer==='svg'?'svg-frame-unavailable':'canvas-unavailable'});}},
    cancel(){
      if(this._staticWaitTimer!=null)clearTimeout(this._staticWaitTimer);this._staticWaitTimer=null;
      this._generation=(this._generation||0)+1;this._svgFlight=null;this._svgMotion=null;
      if(this._firstFrameTimer!=null)clearTimeout(this._firstFrameTimer);this._firstFrameTimer=null;
      if(this._raf!=null&&this._canvas&&this._canvas.cancelAnimationFrame)this._canvas.cancelAnimationFrame(this._raf);
      if(this._timer!=null)clearTimeout(this._timer);
      if(this._watchdog!=null)clearTimeout(this._watchdog);
      this._raf=null;this._timer=null;this._watchdog=null;
    },
    clearSurface(){
      // Opacity alone does not erase a retained native bitmap on all clients.
      try{if(this._ctx&&this._canvas){this._ctx.setTransform(1,0,0,1,0,0);this._ctx.clearRect(0,0,this._canvas.width,this._canvas.height);}}catch(e){}
    },
    schedule(fn){
      if(this.data.renderer==='svg'){this._timer=setTimeout(fn,32);return;}

      const generation=this._generation;let fired=false;
      const deliver=()=>{
        if(fired||generation!==this._generation)return;
        fired=true;if(this._watchdog!=null)clearTimeout(this._watchdog);this._watchdog=null;fn();
      };
      if(this._canvas.requestAnimationFrame&&!this._rafStalled){
        this._raf=this._canvas.requestAnimationFrame(deliver);
        // A reused native canvas may accept rAF but stop delivering callbacks.
        this._watchdog=setTimeout(()=>{
          if(fired||generation!==this._generation)return;
          this._rafStalled=true;
          if(this._canvas.cancelAnimationFrame)this._canvas.cancelAnimationFrame(this._raf);
          this._raf=null;deliver();
        },48);
      }else this._timer=setTimeout(deliver,16);
    },
    paint(subs,onCommit,first){
      if(this.data.renderer==='svg'){
        // At most one outstanding image update per icon; never queue frame backlogs.
        if(this._svgFlight)return;
        const flight={},generation=this._generation,shown=engine.copy(subs);
        const encodedAt=Date.now(),src=frameSvg(shown,this.data.color);this._svgFlight=flight;
        const queuedAt=Date.now(),metrics=this._frameMetrics;
        if(metrics){const cost=queuedAt-encodedAt;metrics.frames++;metrics.encodeTotalMs+=cost;metrics.encodeMaxMs=Math.max(metrics.encodeMaxMs,cost);}
        if(first)this.recordRender('first-frame-queued');
        const patch={painting:true,frameSrc:src,renderRevision:this.data.viewCommand?this.data.viewCommand.revision:0};
        if(first)Object.assign(patch,{frameSlots:[{id:generation}],frameVisible:false,loadingSrc:src});
        this.setData(patch,()=>{
          if(this._svgFlight!==flight)return;
          this._svgFlight=null;
          if(metrics){const now=Date.now(),cost=now-queuedAt;metrics.commitTotalMs+=cost;metrics.commitMaxMs=Math.max(metrics.commitMaxMs,cost);
            if(metrics.lastCommitAt)metrics.intervalMaxMs=Math.max(metrics.intervalMaxMs,now-metrics.lastCommitAt);metrics.lastCommitAt=now;}
          if(first)this.recordRender('first-frame-view-commit');
          if(this._alive&&!this._hidden&&generation===this._generation){this._displayed=shown;if(onCommit)onCommit();}
        });return;
      }
      const ctx=this._ctx,c=this._canvas;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
      ctx.setTransform(c.width/24,0,0,c.height/24,0,0);ctx.lineWidth=1.75;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=this.data.color;
      for(const s of subs){const a=s.pts;if(a.length<2)continue;ctx.beginPath();ctx.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)ctx.lineTo(a[i],a[i+1]);if(s.closed)ctx.closePath();ctx.stroke();}
    },
    move(immediate){
      if((!this._ctx&&!this._svgReady)||this._hidden||!this._alive||this.data.entryActive===false)return;
      const signature=JSON.stringify([this.data.name,this.data.quiet,this.data.color,this.data.fromName,this.data.entryKey]);
      if(!immediate&&signature===this._appliedSignature&&(this.data.painting||this._settledName===this.data.name))return;
      this._appliedSignature=signature;
      if(this.data.renderer==='svg'&&this.data.painting&&this._displayed)this._current=engine.copy(this._displayed);
      this.cancel();
      const generation=this._generation,entryKey=this.data.entryKey;
      try{
        if(this.data.entryKey&&this.data.entryKey!==this._entryKey&&this.data.fromName){
          this._entryKey=this.data.entryKey;this._current=engine.copy(engine.sample(this.data.fromName));this._settledName=this.data.fromName;
        }
        if(immediate||this.data.quiet||!this._current||this._settledName===this.data.name){
          this._current=engine.copy(engine.sample(this.data.name));this._settledName=this.data.name;
          this.clearSurface();this._displayed=null;this.setData({settledEntryKey:this.data.entryKey,staticName:this.data.name,painting:false,frameSrc:''});this.triggerEvent('report',{mode:this.data.quiet?'quiet':'ready',name:this.data.name});return;
        }
        this._settledName=null;if(this.data.renderer!=='svg')this.setData({painting:true});
        const planning=Date.now(),state=engine.plan(this._current,this.data.name),planMs=Date.now()-planning,started=Date.now();
        if(this.data.renderer==='svg'){this.startSvg(state,planMs);return;}
        let frames=0,cpuMax=0,last=started;const intervals=[];
        const step=()=>{
          this._raf=null;this._timer=null;if(!this._alive||this._hidden||(!this._ctx&&!this._svgReady)||generation!==this._generation)return;
          try{
            const now=Date.now(),t=frames===0?0:Math.min(1,(now-started)/380),ease=t*t*(3-2*t);intervals.push(now-last);last=now;
            // Copy the currently drawn geometry so reversal starts here, not at an endpoint.
            this._current=engine.copy(engine.frame(state,ease));this.paint(this._current);frames++;cpuMax=Math.max(cpuMax,Date.now()-now);
            if(t<1)this.schedule(step);else{
              this._current=engine.copy(engine.sample(state.name));this._settledName=state.name;this._svgFlight=null;this._displayed=null;this.clearSurface();this.setData({settledEntryKey:entryKey,staticName:state.name,painting:false,frameSrc:''});
              const sorted=intervals.slice(1).sort((a,b)=>a-b);
              this.triggerEvent('report',{mode:'complete',name:state.name,frames,durationMs:Date.now()-started,planMs,cpuMaxMs:cpuMax,p95IntervalMs:sorted[Math.floor((sorted.length-1)*.95)]||0,scheduler:this.data.renderer==='svg'?'svg-timer':this._rafStalled?'timer-fallback':this._canvas.requestAnimationFrame?'canvas-rAF':'timer'});
            }
          }catch(e){this.canvasError();}
        };step();
      }catch(e){this.canvasError();}
    }
  }
});
