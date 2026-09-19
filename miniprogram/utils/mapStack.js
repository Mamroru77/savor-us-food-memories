// Screen-space layout only. No restaurant coordinates are changed.
// Same curve as bottom card cubic-bezier(1/3, 0, 2/3, 1): x=t, y=smoothstep(t).
const WIDTH=80, HEIGHT=89, STEP=101, ARROW=40, DURATION=320;
function ease(progress) {
  const t=Math.max(0,Math.min(1,Number(progress)||0));
  return t*t*(3-2*t);
}
function layout(count,progress) {
  // progress is already eased once by the transition driver. No per-row delay.
  const t=Math.max(0,Math.min(1,Number(progress)||0));
  const slots=Array.from({length:count},(_,index)=>({rise:Math.round((index+1)*STEP*t),opacity:Number(t.toFixed(3))}));
  const extent=slots.reduce((max,s)=>Math.max(max,s.rise),0),rootTop=ARROW+extent;
  return {height:rootTop+HEIGHT,rootTop,slots:slots.map(s=>({top:rootTop-s.rise,opacity:s.opacity})),width:WIDTH,pinHeight:HEIGHT};
}
function buttonGeometry(windowWidth,nearPin=false) {
  // Map stamps use a bounded native coordinate system; do not let tablet rpx scaling overlap paging.
  const unit=Math.min(430,Number(windowWidth)||375)/750, size=64*unit, hitWidth=Math.max(44,88*unit);
  // The PNG's 28/32 inner material and 14/32 glyph map to 56rpx / 28rpx.
  // Single-page stacks can bring the glyph 8px nearer the pin. Keep its full
  // hit target above the root; paged stacks retain the existing safe gap.
  return {size,left:44-size/2,top:(nearPin?24:16)-size/2,hitWidth,hitLeft:44-hitWidth/2,hitTop:nearPin?0:-4,hitHeight:40};
}
// Mirror positions, never images or real coordinates. Legacy upward layout is unchanged.
function orient(frame,button,down) {
  if(!down)return button;
  const baseTop=button.baseTop===undefined?button.top:button.baseTop;
  const baseHitTop=button.baseHitTop===undefined?button.hitTop:button.baseHitTop;
  frame.slots.forEach(slot=>{slot.top=2*frame.rootTop-slot.top;});
  return Object.assign({},button,{baseTop,baseHitTop,
    top:2*frame.rootTop+HEIGHT-button.size-baseTop,
    hitTop:2*frame.rootTop+HEIGHT-button.hitHeight-baseHitTop});
}
module.exports={layout,ease,buttonGeometry,orient,DURATION,WIDTH,HEIGHT};
