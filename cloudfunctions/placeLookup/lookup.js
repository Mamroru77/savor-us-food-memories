// Fixed-provider, read-only lookup. No arbitrary URLs, redirects, media or database writes.
const https = require('https');
function clean(value,max) { return typeof value==='string'?value.trim().slice(0,max):''; }
function requestJson(url) {
  return new Promise((resolve,reject)=>{
    let settled=false,req;
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};
    const timer=setTimeout(()=>{finish(new Error('UPSTREAM_TIMEOUT'));if(req)req.destroy();},1800);
    try { req=https.get(url,res=>{
      if(res.statusCode!==200){res.resume();finish(new Error('UPSTREAM_FAILED'));return;}
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>512*1024){finish(new Error('UPSTREAM_TOO_LARGE'));req.destroy();}else chunks.push(chunk);});
      res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){finish(new Error('UPSTREAM_INVALID'));}});
      res.on('error',()=>finish(new Error('UPSTREAM_FAILED')));
    });
    req.on('error',()=>finish(new Error('UPSTREAM_FAILED')));
    } catch(e) { finish(new Error('UPSTREAM_FAILED')); }
  });
}
function normalizePoi(p) {
  if(!p || typeof p.id!=='string' || !p.id.trim() || typeof p.title!=='string' || !p.title.trim() || !p.location || !Number.isFinite(p.location.lat) || !Number.isFinite(p.location.lng) || Math.abs(p.location.lat)>90 || Math.abs(p.location.lng)>180 || (p.type!==undefined&&p.type!==0)) return null;
  return {id:clean(p.id,100),name:clean(p.title,100),address:clean(p.address,150),categoryText:clean(p.category,120),
    coordinates:[p.location.lat,p.location.lng],city:clean(p.ad_info&&p.ad_info.city,80),
    provider:'tencent',coordinateSystem:'gcj02'};
}
function createHandler({getOpenid,env,request=requestJson,now=Date.now}) {
  const recent=new Map();
  return async(event={})=>{
    const owner=getOpenid();if(!owner)return {success:false,code:'UNAUTHENTICATED'};
    const key=env.TENCENT_MAP_KEY,allow=String(env.PLACE_LOOKUP_ALLOWED_OPENIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!key || !allow.length)return {success:false,code:'LOOKUP_NOT_CONFIGURED'};
    if(!allow.includes(owner))return {success:false,code:'LOOKUP_NOT_AUTHORIZED'};
    if(env.PLACE_LOOKUP_ENABLED!=='true')return {success:false,code:'LOOKUP_DISABLED'};
    if(typeof event.keyword!=='string'||!event.keyword.trim()||event.keyword.length>70||typeof event.city!=='string'||event.city.length>40||!/^[\u4e00-\u9fffA-Za-z0-9 ·.-]{2,40}$/.test(event.city.trim())||event.city.trim()==='全国')return {success:false,code:'INVALID_LOOKUP_QUERY'};
    const time=now();if(recent.has(owner)&&time-recent.get(owner)<1500)return {success:false,code:'LOOKUP_RATE_LIMITED'};
    recent.set(owner,time);if(recent.size>256)recent.delete(recent.keys().next().value);
    const params=new URLSearchParams({keyword:event.keyword.trim(),boundary:'region('+event.city.trim()+',0)',page_size:'10',page_index:'1',key});
    try {
      const response=await request('https://apis.map.qq.com/ws/place/v1/search?'+params.toString());
      if(!response||response.status!==0||!Array.isArray(response.data))return {success:false,code:'LOOKUP_PROVIDER_FAILED',providerStatus:response&&Number.isInteger(response.status)?response.status:null};
      return {success:true,provider:'tencent',pois:response.data.slice(0,10).map(normalizePoi).filter(Boolean)};
    } catch(e) {return {success:false,code:'LOOKUP_UNAVAILABLE'};}
  };
}
module.exports={createHandler,normalizePoi,requestJson};
