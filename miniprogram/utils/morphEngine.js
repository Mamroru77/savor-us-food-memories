// Pure shape engine adapter. No store, network, DOM, Canvas or wx dependencies.
const core=require('../vendor/morphicons-core');
const nodes=require('./lucideMorphNodes');
const cache={};
function sample(name) {
  if(!nodes[name])throw new Error('Unknown morph icon');
  if(!cache[name])cache[name]=core.resampleIcon(nodes[name],64);
  return cache[name];
}
function plan(current,name) {
  const p=core.buildPlan(current,sample(name));
  return {plan:p,out:core.allocOutputs(p),closed:p.items.map(x=>x.closed),name};
}
function frame(state,t) {
  core.interpPolar(state.plan,Math.max(0,Math.min(1,t)),state.out);
  return state.out.map((pts,i)=>({pts,closed:state.closed[i]}));
}
function copy(subs) {return subs.map(s=>({pts:new Float64Array(s.pts),closed:s.closed}));}
module.exports={sample,plan,frame,copy};
