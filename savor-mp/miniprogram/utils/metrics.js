// Window metrics for custom-navigation layouts (capsule-aware).
// Pages use these to place content below the status bar / capsule —
// never hardcode one device's numbers.
let cached = null;

function getMetrics() {
  if (cached) return cached;
  let statusBarHeight = 20;
  let capsuleBottom = 64;
  let capsuleTop = 24;
  let screenWidth = 375;
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    statusBarHeight = win.statusBarHeight || 20;
    screenWidth = win.windowWidth || 375;
    if (wx.getMenuButtonBoundingClientRect) {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.top) {
        capsuleTop = rect.top;
        capsuleBottom = rect.bottom;
      }
    }
  } catch (error) { /* keep defaults */ }
  cached = {
    statusBarHeight,
    capsuleTop,
    capsuleBottom,
    screenWidth,
    // standard first-stop for page headers below the capsule
    headerTop: Math.max(capsuleBottom + 6, statusBarHeight + 40),
  };
  return cached;
}

module.exports = { getMetrics };
