// Disposable map-only image composition. No diary writes or photo uploads.
const data = require('./data');
const WIDTH = 256, HEIGHT = 286, LIMIT = 96;
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
    const timer=setTimeout(()=>reject(new Error('IMAGE_TIMEOUT')),6000);
    wx.getImageInfo({src,success:r=>{clearTimeout(timer);resolve(r.path);},fail:()=>{clearTimeout(timer);reject(new Error('IMAGE_FAILED'));}});
  });
}
function remove(path) { try { wx.getFileSystemManager().unlinkSync(path); } catch(e) {} }
function createRenderer(canvas) {
  canvas.width=WIDTH*3;canvas.height=HEIGHT*3;
  const ctx=canvas.getContext('2d');
  const cache=new Map(), ready=new Map(), files=new Set();let queue=Promise.resolve(), disposed=false;
  function render(memory, selected) {
    const source=photoFor(memory), backup=fallback(selected);
    if(disposed || !source || !data.isSafeImage(source)) return Promise.resolve(backup);
    const key=JSON.stringify([source,!!selected]);
    if(cache.has(key)) return cache.get(key);
    if(cache.size>=LIMIT) return Promise.resolve(backup);
    const job=queue.then(async()=>{
      if(disposed) return backup;
      let downloaded='';
      try {
        let local=source;
        if(data.isCloudImage(source)) {
          local=await require('./cloudRecords').downloadMapPhoto(source);downloaded=local;
        } else if(!source.startsWith('/images/')) local=await info(source);
        if(disposed) return backup;
        const photo=await image(canvas,local);
        const frame=await image(canvas,'/images/markers/landmark-'+(selected?'selected':'normal')+'-frame.png');
        if(disposed) return backup;
        ctx.setTransform(3,0,0,3,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
        ctx.save();rounded(ctx,32,43,192,195,27);ctx.clip();
        const scale=Math.max(192/photo.width,195/photo.height),w=photo.width*scale,h=photo.height*scale;
        ctx.drawImage(photo,32+(192-w)/2,43+(195-h)/2,w,h);ctx.restore();
        ctx.drawImage(frame,0,0,WIDTH,HEIGHT);
        const path=await new Promise((resolve,reject)=>{
          let expired=false;
          const timer=setTimeout(()=>{expired=true;reject(new Error('EXPORT_TIMEOUT'));},6000);
          try {wx.canvasToTempFilePath({canvas,fileType:'png',width:WIDTH*3,height:HEIGHT*3,destWidth:WIDTH*3,destHeight:HEIGHT*3,
            success:r=>{clearTimeout(timer);if(expired){remove(r.tempFilePath);return;}resolve(r.tempFilePath);},
            fail:()=>{clearTimeout(timer);reject(new Error('EXPORT_FAILED'));}});
          } catch(e) {clearTimeout(timer);reject(e);}
        });
        if(disposed) {remove(path);return backup;}
        files.add(path);return path;
      } catch(e) {return backup;}
      finally {if(downloaded) remove(downloaded);}
    });
    cache.set(key,job);job.then(path=>{
      if(disposed)return;
      // A failed download/canvas export is not a ready photo. Retry only when a later
      // existing render request arrives; no polling, timer or second renderer.
      if(path===backup){cache.delete(key);ready.delete(key);}else ready.set(key,path);
    });queue=job.catch(()=>{});return job;
  }
  return {render,peek(memory,selected){return ready.get(JSON.stringify([photoFor(memory),!!selected]));},dispose(){disposed=true;files.forEach(remove);files.clear();cache.clear();ready.clear();}};
}
module.exports={style,photoFor,fallback,createRenderer};
