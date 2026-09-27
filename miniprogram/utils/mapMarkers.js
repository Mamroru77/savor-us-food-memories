// Disposable map-only image composition. No diary writes or photo uploads.
const data = require('./data');
// Dev-only diagnostics. Every call is a no-op unless a developer switched it on, and it
// can only ever store allowlisted tokens and counts (see utils/mapTrace.js).
const trace = require('./mapTrace');
const WIDTH = 256, HEIGHT = 286;
// Bound on distinct composed variants kept per renderer. It must comfortably exceed
// the number of markers a zoomed-in map can show at once, otherwise the renderer
// starts refusing work and markers sit on the bundled fallback for the whole session.
// Entries are temp-file paths (the pixels live on disk) and are all removed by dispose().
const LIMIT = 512;
// Three stages, three different resource constraints. They are deliberately separate:
// one slow cloud download must not serialise the whole map, but a large original must
// never be decoded concurrently.
//   1 NETWORK    cloud download / local resolve only. Never touches pixels.
//   2 HEAVY      read the real size, re-encode a large original into a small disposable
//                derivative through the native image API, then decode. A full-size
//                decode is the memory spike this stage exists to remove, so it shares
//                the same single slot as the re-encode.
//   3 COMPOSE    owns the single shared canvas -> strictly serial.
const DOWNLOAD_CONCURRENCY = 3;
const HEAVY_CONCURRENCY = 1;
// Long edge of the disposable derivative handed to the canvas decoder. The composed
// marker paints the photo into a 192x195 logical crop and exports at 3x (768x858); the
// native map then shows that image at 48px (normal) or 80px (selected). At a 3x device
// pixel ratio the largest on-screen footprint is 80*3 = 240 device pixels, so a 384px
// source still carries more detail than the screen can resolve. Anything smaller would
// start to be visible; anything larger is decoded and thrown away.
const SOURCE_LONG_EDGE = 384;
const fallback = selected => '/images/markers/landmark-' + (selected ? 'selected' : 'normal') + '-fallback.png';
function photoFor(memory) { return memory.placePhoto || (!memory.noPhoto ? memory.photo : '') || ''; }
function style(selected) {
  const width = selected ? 80 : 48;
  return { iconPath: fallback(selected), width, height: width * HEIGHT / WIDTH,
    anchor: { x: 0.5, y: 276 / HEIGHT }, zIndex: selected ? 9999 : 100 };
}
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function image(canvas, src) {
  return new Promise((resolve,reject) => {
    const img=canvas.createImage();const timer=setTimeout(()=>reject(new Error('IMAGE_TIMEOUT')),6000);
    img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(new Error('IMAGE_FAILED'));};img.src=src;
  });
}
function info(src) {
  return new Promise((resolve,reject)=>{
    if(!wx.getImageInfo){reject(new Error('IMAGE_INFO_UNAVAILABLE'));return;}
    const timer=setTimeout(()=>reject(new Error('IMAGE_TIMEOUT')),6000);
    wx.getImageInfo({src,success:r=>{clearTimeout(timer);resolve(r||{});},fail:()=>{clearTimeout(timer);reject(new Error('IMAGE_FAILED'));}});
  });
}
// Native re-encode to a small disposable derivative. The user's original is only read.
function shrink(src,width,height) {
  return new Promise((resolve,reject)=>{
    if(!wx.compressImage){reject(new Error('COMPRESS_UNAVAILABLE'));return;}
    const timer=setTimeout(()=>reject(new Error('COMPRESS_TIMEOUT')),6000);
    wx.compressImage({src,compressedWidth:width,compressedHeight:height,quality:80,
      success:r=>{clearTimeout(timer);(r&&r.tempFilePath)?resolve(r.tempFilePath):reject(new Error('COMPRESS_FAILED'));},
      fail:()=>{clearTimeout(timer);reject(new Error('COMPRESS_FAILED'));}});
  });
}
// null means "no derivative needed or impossible" - never a zero-sized canvas source.
function fitLongEdge(width,height,longEdge) {
  const w=Number(width)||0,h=Number(height)||0;
  if(!(w>0)||!(h>0))return null;
  const scale=longEdge/Math.max(w,h);
  if(!(scale<1))return null;
  return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
}
function remove(path) { if(!path)return; try { wx.getFileSystemManager().unlinkSync(path); } catch(e) {} }
// Wall clock for the dev-only stage timings. Guarded because a stripped sandbox may not
// expose Date at all; a missing clock degrades every timing to 0 rather than breaking a
// render. Read only when tracing is on.
function clock() { return (typeof Date!=='undefined' && Date.now) ? Date.now() : 0; }
function createRenderer(canvas) {
  canvas.width=WIDTH*3;canvas.height=HEIGHT*3;
  const ctx=canvas.getContext('2d');
  const cache=new Map(), ready=new Map(), files=new Set();
  // Dev-only: which trace job produced each ready path, so a rebound photo can be
  // attributed to the job that composed it. Empty while tracing is off.
  const readyTrace=new Map();
  let disposed=false;

  // Frame art never changes and is identical for every job of the same variant, so
  // it is decoded once per renderer, lazily. A failed decode is dropped instead of
  // being cached: the next request retries rather than inheriting a rejection.
  const frameArt={normal:null,selected:null};
  function frameImage(selected) {
    const slot=selected?'selected':'normal';
    if(!frameArt[slot]) {
      const pending=image(canvas,'/images/markers/landmark-'+slot+'-frame.png');
      pending.catch(()=>{if(frameArt[slot]===pending)frameArt[slot]=null;});
      frameArt[slot]=pending;
    }
    return frameArt[slot];
  }

  // Every stage has its own bounded concurrency and its own two-level pending queue.
  // Starting a job never preempts one that is already running; priority only decides
  // who gets the next free slot of that stage. A drained high queue immediately
  // resumes normal work, so nothing starves. Work flows network -> heavy -> compose.
  const queues={network:{high:[],normal:[]},heavy:{high:[],normal:[]},compose:{high:[],normal:[]}};
  const active={network:0,heavy:0,compose:0};
  const LIMITS={network:DOWNLOAD_CONCURRENCY,heavy:HEAVY_CONCURRENCY,compose:1};
  const NEXT={network:'heavy',heavy:'compose',compose:null};
  // Scratch files owned by one job: the downloaded original and the derivative. The
  // composed output is kept in `files` instead, because it is what the map displays.
  function release(entry) { while(entry.owned.length) remove(entry.owned.pop()); }

  // Stage 1 - NETWORK. May overlap. Never touches ctx or the canvas pixels.
  async function networkStage(entry) {
    const started=clock();
    try {
      trace.record(entry.jobId, { sourceKind: trace.sourceKindOf(entry.source), stage: 'download' });
      if(data.isCloudImage(entry.source)) {
        const local=await require('./cloudRecords').downloadMapPhoto(entry.source);
        if(local) entry.owned.push(local);
        entry.local=local;
      } else if(entry.source.startsWith('/images/')) {
        // Bundled package art is already small; never re-encode a package asset.
        entry.local=entry.source;entry.bundled=true;
      } else {
        const meta=await info(entry.source);
        entry.local=(meta&&meta.path)||entry.source;entry.meta=meta;
      }
      // The size of the file the decoder would have been handed before any derivative.
      trace.record(entry.jobId, { originalBytes: trace.fileBytes(entry.local), downloadMs: clock()-started });
      return !disposed;
    } catch(e) { entry.reason='download-failed';trace.record(entry.jobId,{reason:'download-failed',downloadMs:clock()-started});return false; }
  }

  // Stage 2 - HEAVY. Reads the real size and, for a large original, re-encodes a small
  // disposable derivative first. Exactly one of these runs at a time.
  async function heavyStage(entry) {
    const started=clock();
    try {
      let decoded=entry.local;
      if(!entry.bundled) {
        let meta=entry.meta;
        if(!meta) { try { meta=await info(entry.local); } catch(e) { meta=null;entry.reason='size-unavailable'; } }
        const w=Number(meta&&meta.width)||0,h=Number(meta&&meta.height)||0;
        entry.originalWidth=w;entry.originalHeight=h;
        trace.record(entry.jobId, { originalWidth: w, originalHeight: h });
        const fit=fitLongEdge(w,h,SOURCE_LONG_EDGE);
        if(fit) {
          try {
            const derivative=await shrink(entry.local,fit.width,fit.height);
            entry.owned.push(derivative);
            entry.derivativeWidth=fit.width;entry.derivativeHeight=fit.height;
            decoded=derivative;
            trace.record(entry.jobId, { stage: 'downsample', derivativeWidth: fit.width,
              derivativeHeight: fit.height, derivativeBytes: trace.fileBytes(derivative) });
          } catch(e) {
            // No derivative is not a failure: fall back to decoding the original, still
            // inside this single slot, so the peak stays bounded by one large decode.
            entry.reason='derivative-failed';
            trace.record(entry.jobId, { stage: 'downsample', reason: 'derivative-failed' });
          }
        }
      }
      // Size probe + re-encode, whether or not a derivative was actually produced.
      trace.record(entry.jobId, { downsampleMs: clock()-started });
      if(disposed) return false;
      // The decode itself. On a device this is where a 4000x3000 original used to cost
      // ~48 MiB of RGBA; the derivative is what makes this number small.
      const decoding=clock();
      const photo=await image(canvas,decoded);
      const frame=await frameImage(entry.selected);
      if(disposed) return false;
      entry.photo=photo;entry.frame=frame;
      trace.record(entry.jobId, { stage: 'decode', decodeMs: clock()-decoding });
      return true;
    } catch(e) { entry.reason=entry.reason||'decode-failed';trace.record(entry.jobId,{reason:entry.reason});return false; }
  }

  // Stage 3 - COMPOSE. Owns the shared canvas, so exactly one of these runs at a time.
  async function composeStage(entry) {
    const started=clock();
    try {
      const {photo,frame}=entry;
      trace.record(entry.jobId, { stage: 'compose' });
      ctx.setTransform(3,0,0,3,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
      ctx.save();rounded(ctx,32,43,192,195,27);ctx.clip();
      const scale=Math.max(192/photo.width,195/photo.height),w=photo.width*scale,h=photo.height*scale;
      ctx.drawImage(photo,32+(192-w)/2,43+(195-h)/2,w,h);ctx.restore();
      ctx.drawImage(frame,0,0,WIDTH,HEIGHT);
      // Canvas draw calls are synchronous; this is the CPU cost of the 768x858 compose.
      trace.record(entry.jobId, { composeMs: clock()-started });
      const exporting=clock();
      const path=await new Promise((resolve,reject)=>{
        let expired=false;
        const timer=setTimeout(()=>{expired=true;reject(new Error('EXPORT_TIMEOUT'));},6000);
        try {wx.canvasToTempFilePath({canvas,fileType:'png',width:WIDTH*3,height:HEIGHT*3,destWidth:WIDTH*3,destHeight:HEIGHT*3,
          success:r=>{clearTimeout(timer);if(expired){remove(r.tempFilePath);return;}resolve(r.tempFilePath);},
          fail:()=>{clearTimeout(timer);reject(new Error('EXPORT_FAILED'));}});
        } catch(e) {clearTimeout(timer);reject(e);}
      });
      if(disposed) {remove(path);return false;}
      entry.path=path;
      trace.record(entry.jobId, { stage: 'export', exportMs: clock()-exporting,
        totalMs: entry.startedAt>=0?clock()-entry.startedAt:0 });
      return true;
    } catch(e) { entry.reason=entry.reason||'compose-failed';trace.record(entry.jobId,{reason:entry.reason});return false; }
  }

  const STAGES={network:networkStage,heavy:heavyStage,compose:composeStage};

  function enqueue(stage,entry) { queues[stage][entry.selected?'high':'normal'].push(entry); }
  function pump(stage) {
    while(!disposed && active[stage]<LIMITS[stage]) {
      const q=queues[stage],entry=q.high.shift()||q.normal.shift();
      if(!entry) return;
      active[stage]++;
      Promise.resolve().then(()=>STAGES[stage](entry)).then(ok=>{
        active[stage]--;
        if(disposed||!ok) { release(entry);entry.resolve(entry.backup);pump(stage);return; }
        if(stage==='compose') { files.add(entry.path);entry.resolve(entry.path); }
        else { enqueue(NEXT[stage],entry);pump(NEXT[stage]); }
        release(entry);
        pump(stage);
      },()=>{ active[stage]--;release(entry);entry.resolve(entry.backup);pump(stage); });
    }
  }

  function render(memory, selected) {
    const source=photoFor(memory), backup=fallback(selected);
    if(disposed || !source || !data.isSafeImage(source)) {
      const refused=Promise.resolve(backup);
      if(trace.on()) {
        const jobId=trace.newJob(!!selected);
        trace.record(jobId, { applyResult: disposed ? 'disposed' : 'superseded', reason: 'unsafe-source' });
        refused.traceJobId=jobId;
      }
      return refused;
    }
    const key=JSON.stringify([source,!!selected]);
    if(cache.has(key)) return cache.get(key);
    if(cache.size>=LIMIT) return Promise.resolve(backup);
    let resolve;
    const job=new Promise(r=>{resolve=r;});
    const jobId=trace.newJob(!!selected);
    const entry={key,source,selected:!!selected,backup,resolve,owned:[],local:'',bundled:false,meta:null,reason:'',path:'',
      jobId,
      // Only read when tracing is on, so an off trace costs nothing at all. -1 (not 0)
      // marks "no start captured", because a job legitimately begins at clock 0 and a
      // truthiness test would silently zero every totalMs.
      startedAt: jobId?clock():-1};
    // The page reports the apply outcome through this id. A stub renderer simply has no
    // property here, and every trace entry point tolerates a missing id.
    job.traceJobId=entry.jobId;
    cache.set(key,job);
    job.then(path=>{
      if(disposed)return;
      // A failed download/derivative/canvas export is not a ready photo. Retry only
      // when a later existing render request arrives; no polling, timer or second renderer.
      if(path===backup){cache.delete(key);ready.delete(key);readyTrace.delete(key);}
      else {ready.set(key,path);readyTrace.set(key,entry.jobId);}
    });
    enqueue('network',entry);
    pump('network');
    return job;
  }

  function dispose() {
    disposed=true;
    // Queued work never starts and must still settle, so callers never hang.
    Object.keys(queues).forEach(stage=>{
      const q=queues[stage];
      [q.high,q.normal].forEach(list=>{ while(list.length) { const entry=list.shift(); release(entry);entry.resolve(entry.backup); } });
    });
    frameArt.normal=null;frameArt.selected=null;
    files.forEach(remove);files.clear();cache.clear();ready.clear();readyTrace.clear();
  }
  return {render,
    peek(memory,selected){return ready.get(JSON.stringify([photoFor(memory),!!selected]));},
    // Dev-only attribution for a ready photo; 0 when tracing is off or nothing is ready.
    traceJobId(memory,selected){return readyTrace.get(JSON.stringify([photoFor(memory),!!selected]))||0;},
    dispose};
}
module.exports={style,photoFor,fallback,createRenderer,trace};
