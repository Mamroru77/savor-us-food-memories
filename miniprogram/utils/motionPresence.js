// Retain visual content for exit; cancel stale removal on reopen/detach.
function cancel(host,key) {
  const timers=host._motionTimers;
  if(timers&&timers[key]!=null)clearTimeout(timers[key]);
  if(timers)delete timers[key];
}
function update(host,key,open,quiet,duration=320,onHidden) {
  cancel(host,key);
  const mounted=key+'Mounted',closing=key+'Closing';
  if(open){host.setData({[mounted]:true,[closing]:false});return;}
  const finish=()=>{cancel(host,key);host.setData({[mounted]:false,[closing]:false});if(onHidden)onHidden();};
  if(quiet||!host.data[mounted]){finish();return;}
  host.setData({[closing]:true});
  (host._motionTimers||(host._motionTimers={}))[key]=setTimeout(finish,duration);
}
function dispose(host) {Object.keys(host._motionTimers||{}).forEach(key=>cancel(host,key));}
module.exports={update,dispose};
