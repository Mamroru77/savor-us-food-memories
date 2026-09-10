// Savor — WeChat mini program.
// The app shell stays deliberately tiny: the custom tab bar must never depend
// on this file, on the store, or on any asset to render its first frame.
App({
  onLaunch() {
    // Inject the bundled web fonts first thing so first paint matches the
    // concept; loadFontFace is async and fails soft to system stacks.
    try {
      require('./utils/fonts').initFonts();
    } catch (error) { /* system fallbacks remain */ }

    // Warm the diary store lazily; a failure here must not break navigation.
    try {
      const store = require('./utils/store');
      store.get();
    } catch (error) {
      // Pages re-attempt loading on their own and fall back to sample data.
    }
  },
  globalData: {},
});
