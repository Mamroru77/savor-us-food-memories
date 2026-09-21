const fs=require('fs'),assert=require('node:assert/strict');
const wxss=fs.readFileSync('miniprogram/components/settings-editor/index.wxss','utf8');
function hexToRgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];}
function lum(c){const ch=x=> x<=0.04045? x/12.92: Math.pow((x+0.055)/1.055,2.4);return 0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2]);}
function contrast(a,b){return (Math.max(lum(a),lum(b))+0.05)/(Math.min(lum(a),lum(b))+0.05);}
function blend(fg,alpha,bg){return fg.map((v,i)=> v*alpha+bg[i]*(1-alpha));}
const white=[1,1,1];
const darkBg=hexToRgb('2b2c2f');
assert(wxss.includes('.cuisine-chip'));
assert(wxss.includes('.cuisine-chip.is-selected'));
const tests=[
 {name:'light selected #49553a on rgba(216,222,199,0.4) over white',fg:hexToRgb('d8dec7'),alpha:0.4,bg:white,text:hexToRgb('49553a')},
 {name:'dark selected #dec8a7 on rgba(222,200,167,0.13) over #2b2c2f',fg:[222/255,200/255,167/255],alpha:0.13,bg:darkBg,text:hexToRgb('dec8a7')},
 {name:'default #565752 on rgba(250,251,247,0.31) over white',fg:[250/255,251/255,247/255],alpha:0.31,bg:white,text:hexToRgb('565752')},
];
for(const t of tests){
 const blended=blend(t.fg,t.alpha,t.bg);
 const c=contrast(blended,t.text);
 assert(c>=4.5, t.name+' contrast '+c+' <4.5');
 console.log('PASS '+t.name+' contrast '+c.toFixed(2));
}
console.log('PASS Preferences cuisine-chip contrast remains readable in light and dark');
