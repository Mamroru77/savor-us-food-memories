// Pure SVG frame encoder for regular image-layer morphs (no native Canvas).
function frameSvg(subs,color) {
  const number=value=>{if(!Number.isFinite(value))throw new Error('Invalid morph point');return String(Number(value.toFixed(3)));};
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const paths=subs.map(s=>{
    const pts=s.pts;if(!pts||pts.length<2)return '';
    let d='M'+number(pts[0])+' '+number(pts[1]);
    for(let i=2;i<pts.length;i+=2)d+='L'+number(pts[i])+' '+number(pts[i+1]);
    return '<path d="'+d+(s.closed?'Z':'')+'"/>';
  }).join('');
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+escape(color)+'" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>');
}
module.exports={frameSvg};
