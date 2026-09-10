// memory-row — port of the web Primitives.MemoryRow.
const { formatDate } = require('../../utils/data');
const { photos } = require('../../utils/data');

Component({
  properties: {
    memory: { type: Object, value: null },
  },

  data: {
    dateLabel: '',
    location: '',
    photoSrc: '',
  },

  observers: {
    memory: function (memory) {
      if (!memory) return;
      this.setData({
        dateLabel: formatDate(memory.date),
        location: (memory.neighborhood ? memory.neighborhood + ', ' : '') + memory.city,
        photoSrc: memory.placePhoto || memory.photo || photos.meal,
      });
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('open', { id: this.data.memory.id });
    },
    onPhotoError() {
      if (this.data.photoSrc !== photos.meal) this.setData({ photoSrc: photos.meal });
    },
  },
});
