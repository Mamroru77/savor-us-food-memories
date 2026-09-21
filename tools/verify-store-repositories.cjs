const assert=require('node:assert/strict');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}

const settings=require('../miniprogram/utils/settingsRepository');
test('settings normalize invalid persisted display values',()=>{
  const value=settings.normalize({theme:'unknown',language:'xx',reminders:false});
  assert.equal(value.theme,'pearl');
  assert.equal(value.language,'system');
  assert.equal(value.reminders,false);
});
test('settings merge preserves data and classifies lease-required keys',()=>{
  assert.deepEqual(settings.merge({language:'en',custom:true},{language:'xx'}),{language:'system',custom:true});
  assert.equal(settings.requiresLease({theme:'dusk',language:'en',reduceMotion:true}),false);
  assert.equal(settings.requiresLease({dietary:'Vegan'}),true);
});

console.log(count+' Store repository checks passed.');
