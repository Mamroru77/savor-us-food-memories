// s-toast — bottom dark pill, driven by store.notify() (web toast parity).
const store = require('../../utils/store');

Component({
  data: { toast: null, dusk: false },

  lifetimes: {
    attached() {
      this.offToast = store.onToast(function (toast) {
        this.setData({ toast: toast });
      }.bind(this));
    },
    detached() {
      if (this.offToast) this.offToast();
    },
  },

  methods: {
    dismiss() {
      store.dismissToast();
    },
  },
});
