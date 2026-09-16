// Small conservative taxonomy: explicit source text is separate from name-only suggestions.
const TYPES=['火锅','自助餐','烧烤','小吃','面馆','咖啡馆','甜品','酒馆'];
function classify(text) {
  const raw=String(text||'');
  const cuisineRules=[[/韩式|韩国|韩餐/,'韩餐'],[/日本|日式|日料|寿司/,'日料'],[/泰国|泰式|泰餐/,'泰餐'],[/西餐|意大利|法餐|法国菜/,'西餐'],[/中餐|中式|粤菜|川菜|湘菜|鲁菜|淮扬|本帮|东北菜/,'中餐']];
  const rules=[[/火锅|寿喜烧/,'火锅'],[/自助/,'自助餐'],[/烧烤|烤肉/,'烧烤'],[/小吃|快餐/,'小吃'],[/面馆|面食/,'面馆'],[/咖啡/,'咖啡馆'],[/甜品|蛋糕|冰淇淋/,'甜品'],[/酒吧|酒馆/,'酒馆']];
  const cuisine=(cuisineRules.find(r=>r[0].test(raw))||[])[1]||'';
  return {cuisine,diningTypes:rules.filter(r=>r[0].test(raw)).map(r=>r[1])};
}
function explicit(text,source) {
  const sourceCategory=String(text||'').trim().slice(0,120);
  return Object.assign(classify(sourceCategory),{sourceCategory,categorySource:sourceCategory?source:''});
}
function suggestion(name) {
  const text=String(name||'');const result=classify(text);
  if(!result.cuisine && /寿喜烧/.test(text))result.cuisine='日料';
  if(!result.cuisine && /嘎抛/.test(text))result.cuisine='泰餐';
  return result;
}
function compareBranch(expected,actual) {
  const normalize=s=>String(s||'').toLowerCase().replace(/[\s·•!！]/g,'').replace(/（/g,'(').replace(/）/g,')');
  // Equality is a textual clue, never automatic proof of physical identity.
  return normalize(expected)===normalize(actual)?'same-name':'review-name';
}
function summary(memory) {
  return Array.from(new Set([typeof memory.cuisine==='string'?memory.cuisine:''].concat(Array.isArray(memory.diningTypes)?memory.diningTypes.filter(t=>TYPES.includes(t)):[]).filter(Boolean))).join(' · ');
}
module.exports={TYPES,classify,explicit,suggestion,compareBranch,summary};
