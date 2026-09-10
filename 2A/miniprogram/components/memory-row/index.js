// One row of the recent / library lists: cover, name, date, place. Falls back to the bundled photo on load errors.
Component({
  options: { styleIsolation: 'shared' },
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
