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
function smoothPath(points) {
  if (!points.length) return '';
  let d = 'M' + points[0][0].toFixed(1) + ',' + points[0][1].toFixed(1);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}
function chart(counts) {
  const list = Array.isArray(counts) && counts.length >= 2 ? counts.map(v => Math.max(0, Number(v) || 0)) : [0, 0, 0, 0, 0, 0, 0];
  const n = list.length;
  const hasData = list.some(v => v > 0);
  const max = Math.max(1, ...list);
  const step = 250 / (n - 1);
  // Concept-faithful soft dual-layer silk wave: real weekly rhythm when active, calm
  // sweeping horizon swell when this week has zero entries so it never flattens into a hard line.
  const idleFront = [43, 31, 22, 29, 34, 24, 33];
  const idleBack = [46, 40, 33, 24, 26, 35, 42];
  const frontPts = list.map((v, i) => [i * step, hasData ? (46 - (v / max) * 34) : idleFront[i % idleFront.length]]);
  const backPts = list.map((v, i) => {
    const prev = list[Math.max(0, i - 1)], next = list[Math.min(n - 1, i + 1)];
    const avg = (prev + v + next) / 3;
    return [i * step, hasData ? (48 - (avg / max) * 26) : idleBack[i % idleBack.length]];
  });
  const frontLine = smoothPath(frontPts);
  const frontArea = frontLine + ' L250,56 L0,56 Z';
  const backLine = smoothPath(backPts);
  const backArea = backLine + ' L250,56 L0,56 Z';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 56" preserveAspectRatio="none">' +
    '<defs>' +
    '<linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9e978c" stop-opacity="0.16"/><stop offset="100%" stop-color="#9e978c" stop-opacity="0.01"/></linearGradient>' +
    '<linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8d877c" stop-opacity="0.22"/><stop offset="100%" stop-color="#8d877c" stop-opacity="0.02"/></linearGradient>' +
    '</defs>' +
    '<path d="' + backArea + '" fill="url(#wb)"/>' +
    '<path d="' + backLine + '" fill="none" stroke="#c8c1b6" stroke-opacity="0.62" stroke-width="1"/>' +
    '<path d="' + frontArea + '" fill="url(#wf)"/>' +
    '<path d="' + frontLine + '" fill="none" stroke="#a69f94" stroke-opacity="0.88" stroke-width="1.4" stroke-linecap="round"/>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
module.exports = { countSaved, isSample, real, summary, placeKey, chart };
