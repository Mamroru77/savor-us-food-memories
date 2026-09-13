// Web Mercator screen projection for north-up, unpitched native map bounds.
// Input coordinates are never modified or persisted.
function mercator(lat) {
  const phi=Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180;
  return Math.log(Math.tan(Math.PI/4+phi/2));
}
function project(coordinates,region,rect) {
  if(!coordinates||!region||!region.southwest||!region.northeast||!rect)return null;
  const sw=region.southwest,ne=region.northeast;
  const lat=Number(coordinates[0]),lng=Number(coordinates[1]);
  if(![lat,lng,sw.latitude,sw.longitude,ne.latitude,ne.longitude,rect.width,rect.height].every(Number.isFinite))return null;
  let span=ne.longitude-sw.longitude;if(span<0)span+=360;
  const north=mercator(ne.latitude),south=mercator(sw.latitude);
  if(span<=0||north<=south||rect.width<=0||rect.height<=0)return null;
  let dx=lng-sw.longitude;if(span<180&&dx< -180)dx+=360;
  return {x:dx/span*rect.width,y:(north-mercator(lat))/(north-south)*rect.height};
}
module.exports={project};
