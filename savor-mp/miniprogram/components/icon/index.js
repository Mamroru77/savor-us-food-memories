// s-icon — tiny vector icon component (SVG data URI inside a plain <image>).
// Zero business dependencies: it must never fail because of the store.
const { iconSvg } = require('../../utils/icons');

Component({
  properties: {
    name: { type: String, value: '' },
    size: { type: null, value: 44 },      // rpx
    color: { type: String, value: '#1b1c1a' },
    fill: { type: String, value: 'none' },
    stroke: { type: null, value: 1.5 },
  },

  data: { src: '', box: '' },

  observers: {
    'name, color, fill, stroke': function () {
      this.render();
    },
  },

  lifetimes: {
    attached() {
      this.render();
    },
  },

  methods: {
    render() {
      const { name, size, color, fill, stroke } = this.data;
      const src = name ? iconSvg(name, { stroke: color, fill, strokeWidth: stroke }) : '';
      const box = `width:${size}rpx;height:${size}rpx`;
      if (src !== this.data.src || box !== this.data.box) this.setData({ src, box });
    },
  },
});
