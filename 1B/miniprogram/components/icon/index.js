const { iconSvg } = require('../../utils/icons');

Component({
  properties: {
    name: { type: String, value: '' },
    size: { type: null, value: 18 },
    color: { type: String, value: '#1b1c1a' },
    fill: { type: String, value: 'none' },
    stroke: { type: null, value: 1.5 },
    alt: { type: String, value: '' },
  },
  data: { src: '' },
  observers: {
    'name, color, fill, stroke, alt': function () { this.render(); },
  },
  lifetimes: {
    attached() { this.render(); },
  },
  methods: {
    render() {
      const src = iconSvg(this.data.name, { color: this.data.color, fill: this.data.fill, stroke: this.data.stroke, alt: this.data.alt });
      if (src !== this.data.src) this.setData({ src });
    },
  },
});
