// Small, read-only selectors for real user memories. No cloud calls or writes.
const { initialMemories, isValidDate } = require('./data');
const sampleIds = initialMemories.map(memory => memory.id);
function isSample(memory) {
  return !!memory && !memory.cloudId && sampleIds.indexOf(memory.id) >= 0;
}
// Count bookmarked memories (saved), not restaurants or heart/liked events.
// Us scopes this to shared memories; Me includes every real saved memory.
function countSaved(memories, sharedOnly) {
  const seen = Object.create(null);
  return (memories || []).reduce(function (count, memory) {
    if (!memory || !memory.id || seen[memory.id]) return count;
    seen[memory.id] = true;
    if (isSample(memory) || memory.saved !== true || (sharedOnly && memory.shared !== true)) return count;
    return count + 1;
  }, 0);
}
const dates=require('./localDate');
function real(memories, sharedOnly) { const seen=Object.create(null); return (memories || []).filter(m=>m && typeof m.id==='string' && isValidDate(m.date) && !m.deleted && !m.pendingDelete && !isSample(m) && (!sharedOnly || m.shared) && !seen[m.id] && (seen[m.id]=true)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)); }
function placeKey(m) {
  const name=String(m.restaurant||'').trim().toLowerCase().replace(/\s+/g,' ');
  if (m.locationSource==='tencent-picker' && !m.locationUnknown && Array.isArray(m.coordinates)) return name+'|'+m.coordinates.map(x=>Number(x).toFixed(4)).join(',');
  if (m.geoConfirmed && m.city && m.country) return name+'|'+m.city+'|'+m.country+'|'+(m.address||m.neighborhood||'');
  return ''; // unknown locations must not fabricate unique venues
}
function summary(memories, sharedOnly, now) {
  const all=real(memories,sharedOnly), w=dates.week(now), weekly=all.filter(m=>m.date>=w.start&&m.date<=w.end);
  const places=list=>new Set(list.map(placeKey).filter(Boolean)).size;
  const counts=w.dates.map(date=>weekly.filter(m=>m.date===date).length);
  return {all,weekly,meals:all.length,places:places(all),cities:new Set(all.filter(m=>m.geoConfirmed&&m.city&&m.country).map(m=>m.country+'|'+m.city)).size,saved:countSaved(all),weeklyMeals:weekly.length,weeklyPlaces:places(weekly),counts,dates:w.dates};
}
function chart(counts) { const max=Math.max(1,...counts), pts=counts.map((v,i)=>(i*250/6).toFixed(1)+','+(48-v/max*38).toFixed(1)).join(' '); return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#aaa69e" stroke-width="1.2"/></svg>'); }
module.exports = { countSaved, isSample, real, summary, placeKey, chart };
