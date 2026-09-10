Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    memory: { type: Object, value: null },
    ink: { type: String, value: '#565752' },
  },
  data: { failed: false },
  observers: {
    'memory.photo, memory.placePhoto': function () { if (this.data.failed) this.setData({ failed: false }); },
  },
  methods: {
    open() { if (this.data.memory) this.triggerEvent('select', { id: this.data.memory.id }); },
    onError() { if (!this.data.failed) this.setData({ failed: true }); },
  },
});
