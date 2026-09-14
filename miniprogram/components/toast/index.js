const motionPresence = require('../../utils/motionPresence');
// s-toast — bottom dark pill, driven by store.notify() (web toast parity).
const store = require('../../utils/store');
const i18n = require('../../utils/i18n');

Component({
  data: { toast: null, toastMounted:false, toastClosing:false, quiet:false, dusk: false, copy: i18n.copy() },

  lifetimes: {
    attached() {
      const sync = state => this.setData({ dusk: state.settings.theme === 'dusk', quiet:!!state.settings.reduceMotion, copy: i18n.copy() });
      sync(store.get());
      this.offState = store.subscribe(sync);
      this.offToast = store.onToast(function (toast) {
        if(toast)this.setData({ toast: toast });
        motionPresence.update(this,'toast',!!toast,this.data.quiet,220,()=>this.setData({toast:null}));
      }.bind(this));
    },
    detached() {
      motionPresence.dispose(this);
      if (this.offState) this.offState();
      if (this.offToast) this.offToast();
    },
  },

  methods: {
    dismiss() {
      store.dismissToast();
    },
  },
});
