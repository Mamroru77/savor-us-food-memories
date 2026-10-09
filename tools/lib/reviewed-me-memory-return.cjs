// Unknown bytes fail closed before the reviewed current menu is projected onto
// the immutable historical fixture. This does not edit the fixture or product.
const assert=require('node:assert/strict'),crypto=require('crypto'),fs=require('node:fs'),path=require('node:path');
const approvedSha256='efc70e5c48362c241f70fade1e600f8616c6682647a2bc013ae6892f4d6632dc';
const menuPattern=/const MENU_ROWS = [\s\S]*?\n\];/;
function project(source){
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),approvedSha256,'Me source differs from exact reviewed A+menu integration');
 const menu=source.match(menuPattern);assert(menu,'Reviewed menu block is missing');
 const fixture=fs.readFileSync(path.join(__dirname,'../fixtures/regression/lifecycle-review-20260916/batch4/backup/miniprogram/pages/me/index.js'),'utf8');
 assert(fixture.match(menuPattern),'Historical menu block is missing');
 return fixture.replace(menuPattern,menu[0]);
}
module.exports={project,approvedSha256};
