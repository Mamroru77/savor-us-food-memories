// Copy-on-write storage. Each raw string chunk is <= 32K UTF-16 units:
// even JSON escaping every unit stays far below wx's 1 MB/key limit.
// A tiny manifest is the commit point. Never delete legacy keys or other owners.
const CHUNK_UNITS = 32768;
const MAX_UNITS = 8 * 1024 * 1024;
let serial = 0;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function checksum(text) { // Corruption detection only, NOT identity/authentication.
  let hash = 2166136261;
  for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
function createChunkStorage(storage) {
  const empty = v => v === '' || v === null || v === undefined;
  function descriptor(raw) {
    if (empty(raw)) return null;
    let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { fail('CACHE_CORRUPT'); }
    if (!d || d.formatVersion !== 2) fail('CACHE_UNSUPPORTED');
    if (!/^[a-z0-9-]{1,90}$/.test(d.id) || !Number.isInteger(d.count) || d.count<1 || d.count>Math.ceil(MAX_UNITS/(CHUNK_UNITS-1)) || !Number.isInteger(d.length) || d.length<1 || d.length>MAX_UNITS || d.count<Math.ceil(d.length/CHUNK_UNITS) || d.count>Math.ceil(d.length/(CHUNK_UNITS-1)) || !/^[a-f0-9]{1,8}$/.test(d.checksum)) fail('CACHE_CORRUPT');
    return d;
  }
  const partKey = (key,d,i) => key + ':chunk:' + d.id + ':' + i;
  function remove(key) { try { if(!storage.removeStorageSync)return false;storage.removeStorageSync(key);return true; } catch (_) { return false; } }
  function clean(key,d,active) {
    if (!d || active && active.id===d.id) return true;
    let ok=true;for(let i=0;i<d.count;i++) if(!remove(partKey(key,d,i)))ok=false;return ok;
  }
  function recover(key,active) {
    const raw = storage.getStorageSync(key+':pending');
    if (empty(raw)) return;
    let journal; try { journal = JSON.parse(raw); } catch (_) { fail('CACHE_CORRUPT'); }
    if(!journal || !journal.next)fail('CACHE_CORRUPT');
    const next=descriptor(journal.next),old=descriptor(journal.old);
    // A crash before commit leaves active=old; after commit leaves active=next.
    const a=clean(key,next,active),b=clean(key,old,active);
    if(!a||!b||!remove(key+':pending'))fail('CACHE_WRITE_FAILED');
  }
  function read(key) {
    const d=descriptor(storage.getStorageSync(key)); if(!d)return null;
    let text='';
    for(let i=0;i<d.count;i++) {
      const part=storage.getStorageSync(partKey(key,d,i));
      if(typeof part!=='string' || part.length<1 || part.length>CHUNK_UNITS || i<d.count-1&&part.length<CHUNK_UNITS-1) fail('CACHE_CORRUPT');
      text+=part;
    }
    if(text.length!==d.length || checksum(text)!==d.checksum) fail('CACHE_CORRUPT');
    try { return JSON.parse(text); } catch (_) { fail('CACHE_CORRUPT'); }
  }
  function write(key,value) {
    const text=JSON.stringify(value);
    if(typeof text!=='string' || text.length>MAX_UNITS) fail('CACHE_TOO_LARGE');
    const parts=[];
    for(let start=0;start<text.length;){
      let end=Math.min(start+CHUNK_UNITS,text.length);
      // Never send half of a valid surrogate pair through the native string bridge.
      const left=text.charCodeAt(end-1),right=text.charCodeAt(end);
      if(end<text.length && left>=0xd800 && left<=0xdbff && right>=0xdc00 && right<=0xdfff)end--;
      parts.push(text.slice(start,end));start=end;
    }
    const old=descriptor(storage.getStorageSync(key));
    recover(key,old);
    let id;
    do { id=Date.now().toString(36)+'-'+(++serial).toString(36)+'-'+Math.random().toString(36).slice(2,12); }
    while (old && old.id===id || !empty(storage.getStorageSync(key+':chunk:'+id+':0')));
    const next={formatVersion:2,id,count:parts.length,length:text.length,checksum:checksum(text)};
    try {
      storage.setStorageSync(key+':pending',JSON.stringify({old,next}));
      for(let i=0;i<next.count;i++) storage.setStorageSync(partKey(key,next,i),parts[i]);
      // Only this final small write publishes new data. Old data remains on failure.
      storage.setStorageSync(key,JSON.stringify(next));
    } catch (cause) {
      // A native write may have committed before reporting an error. Never delete live chunks.
      let active;try {active=descriptor(storage.getStorageSync(key));}catch(_){fail('CACHE_WRITE_FAILED');}
      if(active && active.id===next.id){if(clean(key,old,next))remove(key+':pending');return;}
      clean(key,next,active);
      // Keep the journal for recovery if cleanup could not complete.
      const error=new Error('CACHE_WRITE_FAILED'); error.code='CACHE_WRITE_FAILED'; error.cause=cause; throw error;
    }
    if(clean(key,old,next))remove(key+':pending');
  }
  return {read,write};
}
module.exports={createChunkStorage,CHUNK_UNITS};
