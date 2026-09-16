// Restricted shared-image transport. No SVG/HTML/data URLs, no user file paths.
// Strip JPEG APP/COM segments and PNG ancillary metadata before storing a copy.
const MAX_BYTES=512*1024,MAX_SIDE=4096,MAX_PIXELS=16777216;
function fail(){const e=new Error('INVALID_IMAGE');e.code='INVALID_IMAGE';throw e;}
function dimensions(width,height){if(!width||!height||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)fail();}
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function sanitize(base64){
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES/3)*4||!base64.length||base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail();
 const b=Buffer.from(base64,'base64');if(b.length>MAX_BYTES||b.toString('base64')!==base64)fail();
 if(b.length>=33&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
  const chunks=[b.subarray(0,8)];let pos=8,width=0,height=0,seenData=false,ended=false;
  while(pos<b.length){
   if(pos+12>b.length)fail();const size=b.readUInt32BE(pos),end=pos+12+size;if(end>b.length)fail();
   const type=b.toString('ascii',pos+4,pos+8);if(!/^[A-Za-z]{4}$/.test(type))fail();
   if(crc32(b.subarray(pos+4,pos+8+size))!==b.readUInt32BE(pos+8+size))fail();
   if(pos===8&&type!=='IHDR')fail();
   if(type==='IHDR'){if(pos!==8||size!==13)fail();width=b.readUInt32BE(pos+8);height=b.readUInt32BE(pos+12);dimensions(width,height);}
   if(type==='IDAT')seenData=true;
   if(type==='IEND'){if(size||!seenData||end!==b.length)fail();ended=true;}
   // Preserve rendering chunks only; reject unknown critical chunks.
   if(['IHDR','PLTE','IDAT','IEND','tRNS'].includes(type))chunks.push(b.subarray(pos,end));
   else if(type[0]===type[0].toUpperCase())fail();
   pos=end;
  }
  if(!ended)fail();return {bytes:Buffer.concat(chunks),mime:'image/png',extension:'png',width,height};
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){
  const chunks=[b.subarray(0,2)];let pos=2,width=0,height=0,sawScan=false,ended=false;
  while(pos<b.length){
   const start=pos;if(b[pos++]!==255)fail();while(b[pos]===255)pos++;const marker=b[pos++];
   if(marker===217){if(!sawScan||pos!==b.length)fail();chunks.push(Buffer.from([255,217]));ended=true;break;}
   if(![192,194,196,219,221,218,254].includes(marker)&&!(marker>=224&&marker<=239))fail();
   if(pos+2>b.length)fail();const length=b.readUInt16BE(pos);if(length<2||pos+length>b.length)fail();const end=pos+length;
   if(marker===192||marker===194){if(length<8||b[pos+2]!==8)fail();height=b.readUInt16BE(pos+3);width=b.readUInt16BE(pos+5);dimensions(width,height);}
   if(marker!==254&&!(marker>=224&&marker<=239))chunks.push(b.subarray(start,end));pos=end;
   if(marker===218){
    if(!width||!height)fail();sawScan=true;const entropyStart=pos;
    while(pos<b.length){if(b[pos]!==255){pos++;continue;}let after=pos+1;while(b[after]===255)after++;if(b[after]===0||(b[after]>=208&&b[after]<=215)){pos=after+1;continue;}break;}
    chunks.push(b.subarray(entropyStart,pos));
   }
  }
  if(!ended)fail();return {bytes:Buffer.concat(chunks),mime:'image/jpeg',extension:'jpg',width,height};
 }
 fail();
}
module.exports={sanitize,MAX_BYTES};
