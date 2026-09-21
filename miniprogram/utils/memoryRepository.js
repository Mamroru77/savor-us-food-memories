const data=require('./data');

function normalize(raw){
  if(!raw||typeof raw!=='object')return null;
  const item=Object.assign({},raw);
  if(['tencent-picker','tencent-search'].includes(item.locationSource)&&item.geoConfirmed!==true){item.city='';item.country='';}
  item.id=typeof item.id==='string'&&item.id?item.id:data.createId();
  item.restaurant=typeof item.restaurant==='string'?item.restaurant.trim():'';
  item.city=typeof item.city==='string'?item.city:'';
  item.country=typeof item.country==='string'?item.country:'';
  item.neighborhood=typeof item.neighborhood==='string'?item.neighborhood:'';
  item.notes=typeof item.notes==='string'?item.notes:'';
  item.rating=Math.round(Number(item.rating));
  if(!(item.rating>=0&&item.rating<=5))item.rating=0;
  item.tags=Array.isArray(item.tags)?item.tags.filter(t=>typeof t==='string'):[];
  item.photo=typeof item.photo==='string'?item.photo:data.photos.meal;
  if(item.placePhoto!==undefined&&!data.isSafeImage(item.placePhoto))item.placePhoto=undefined;
  item.extraPhotos=Array.isArray(item.extraPhotos)?item.extraPhotos.filter(data.isSafeImage):[];
  if(Array.isArray(item.coordinates)&&item.coordinates.length===2&&item.coordinates.every(c=>typeof c==='number'&&Number.isFinite(c))&&Math.abs(item.coordinates[0])<=90&&Math.abs(item.coordinates[1])<=180)item.coordinates=[item.coordinates[0],item.coordinates[1]];
  else item.coordinates=[48.8535,2.3392];
  item.shared=Boolean(item.shared);item.liked=Boolean(item.liked);item.saved=Boolean(item.saved);
  return data.isMemory(item)?item:null;
}

function restore(list){if(!Array.isArray(list))return [];const normalized=list.filter(data.isMemory).concat(list.filter(item=>!data.isMemory(item)).map(normalize).filter(Boolean)),seen=Object.create(null);return normalized.filter(memory=>seen[memory.id]?false:(seen[memory.id]=true));}
function privateCopy(source,id){const memory=Object.assign({},source,{id,importSourceId:source.id,shared:false,liked:false,saved:false});['cloudId','revision','localChanges','pendingDelete','deleted','memberOpenids','coupleId','operationIds','operationReceipts','ratings'].forEach(key=>delete memory[key]);if(memory.ratingSource==='legacy-average'){memory.rating=0;memory.ratingSource='unrated';}memory.photo=data.photos.meal;memory.noPhoto=true;memory.extraPhotos=[];delete memory.placePhoto;return memory;}
function mergeImports(current,copies){const additions=[];copies.forEach(memory=>{if(current.some(row=>row.importSourceId===memory.importSourceId||row.id===memory.importSourceId)||additions.some(row=>row.importSourceId===memory.importSourceId)||current.some(row=>row.id===memory.id)||additions.some(row=>row.id===memory.id))return;additions.push(memory);});return {memories:additions.concat(current),count:additions.length};}

module.exports={restore,privateCopy,mergeImports};
