// Calendar dates use device local time; timestamps may still use ISO UTC.
function today(now) { const d = now || new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function ordinal(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN; const p=value.split('-').map(Number), n=Date.UTC(p[0],p[1]-1,p[2]); return new Date(n).toISOString().slice(0,10)===value ? n/86400000 : NaN; }
function shift(value, days) { const n=ordinal(value); return Number.isFinite(n) ? new Date((n+days)*86400000).toISOString().slice(0,10) : ''; }
function week(now) { const end=today(now), day=new Date(ordinal(end)*86400000).getUTCDay(); const start=shift(end,-((day+6)%7)); return {start,end,dates:Array.from({length:7},(_,i)=>shift(start,i))}; }
function daysSince(date, now) { const n=ordinal(today(now))-ordinal(date); return Number.isFinite(n) ? Math.max(0,n) : 0; }
module.exports={today,ordinal,shift,week,daysSince};
