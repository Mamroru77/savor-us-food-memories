// Screen-space decluttering; never mutate restaurant coordinates.
function project(coordinates, scale) {
  const world=256*Math.pow(2,scale),lat=Math.max(-85,Math.min(85,coordinates[0]))*Math.PI/180;
  return {x:(coordinates[1]+180)/360*world,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*world,world};
}
function overlaps(a,b,scale,selectedId) {
  const p=project(a.coordinates,scale),q=project(b.coordinates,scale);
  const wa=a.id===selectedId?80:48,wb=b.id===selectedId?80:48,ha=wa*286/256,hb=wb*286/256;
  const dx=Math.min(Math.abs(p.x-q.x),p.world-Math.abs(p.x-q.x));
  return dx<(wa+wb)/2+10 && p.y-ha*.965<q.y+hb*.035+10 && q.y-hb*.965<p.y+ha*.035+10;
}
function group(memories,scale,selectedId) {
  const zoom=Number.isFinite(scale)?Math.max(3,Math.min(18,scale)):13;
  const ordered=memories.slice().sort((a,b)=>Number(b.id===selectedId)-Number(a.id===selectedId));
  const groups=[];
  ordered.forEach(memory=>{
    const existing=groups.find(g=>overlaps(g.memory,memory,zoom,selectedId));
    if(existing) existing.members.push(memory);else groups.push({memory,members:[memory]});
  });
  // Preserve representative input order so marker IDs stay stable where possible.
  const indices=new Map(memories.map((m,i)=>[m.id,i]));
  return groups.sort((a,b)=>indices.get(a.memory.id)-indices.get(b.memory.id));
}
function easedSize(from,to,progress) {const t=Math.max(0,Math.min(1,progress));return from+(to-from)*(1-Math.pow(1-t,3));}
module.exports={project,overlaps,group,easedSize};
