// memory-row — port of the web Primitives.MemoryRow.
const { formatDate } = require('../../utils/data');
const { photos, isCloudImage, isSafeImage } = require('../../utils/data');
const cloudRecords = require('../../utils/cloudRecords');
const imageCache = require('../../utils/imageCache');
// The row cell is 112x128rpx. Measured on the attached 3.5x device that is 188x215 device
// pixels, so the SHARED marker variant (384px long edge) already covers it with margin. A list
// cell must not pull a multi-megabyte original just because the platform would scale it: the
// platform still decodes the full-size frame before painting it 54px wide.
const LIST_THUMBNAIL_LONG_EDGE = 384;

Component({
  properties: {
    dusk: { type: Boolean, value: false },
    locale: { type: String, value: 'en' },
    memory: { type: Object, value: null },
  },

  data: {
    dateLabel: '',
    location: '',
    photoSrc: photos.meal,
  },

  observers: {
    'memory, locale': function (memory) {
      if (!memory) { this.loadPhoto(''); this.setData({dateLabel:'',location:''}); return; }
      this.setData({
        dateLabel: formatDate(memory.date),
        location: require('../../utils/locations').display(memory),
      });
      // Returning the promise lets a caller (and the suite) await the row's real completion
      // instead of guessing how many microtasks the pipeline takes.
      return this.loadPhoto(memory.placePhoto || memory.photo || photos.meal);
    },
  },

  lifetimes: {
    attached() { this._photoDetached=false; const m=this.data.memory; if(m)this.loadPhoto(m.placePhoto || m.photo || photos.meal); },
    detached() { this._photoDetached=true; this._photoSerial=(this._photoSerial||0)+1; this._photoSource=''; },
  },

  methods: {
    async loadPhoto(source, refresh) {
      if(this._photoDetached)return;
      const safe=isSafeImage(source)?source:photos.meal;
      if(this._photoSource===safe&&!refresh)return;
      this._photoSource=safe;
      if(!refresh)this._photoRetried=false;
      const serial=this._photoSerial=(this._photoSerial||0)+1;
      this.setData({photoSrc:isCloudImage(safe)?photos.meal:safe});
      if(!isCloudImage(safe))return;
      try {
        // Preferred path: the shared list-thumbnail derivative, through the one image pipeline.
        // It is deduped in flight, reused from the session, persisted in the bounded disk cache
        // and evictable — and it is the SAME file the marker renderer prepared, so a photo that
        // is already on the map costs a list row nothing at all.
        const memory=this.data.memory||{};
        const local=await imageCache.ensureLocal(safe,'marker',LIST_THUMBNAIL_LONG_EDGE,{revision:memory.revision});
        if(this._photoDetached||serial!==this._photoSerial)return;
        if(local){this.setData({photoSrc:local});return;}
        // No derivative available (no filesystem, or an unreadable source): fall back to a
        // resolved URL, which the platform can still render.
        const urls=await cloudRecords.resolvePhotoUrls([safe]);
        if(this._photoDetached||serial!==this._photoSerial)return;
        // Never send unresolved cloud IDs to the component renderer, or store signed URLs.
        if(typeof urls[0]==='string'&&/^https:\/\//.test(urls[0]))this.setData({photoSrc:urls[0]});
      } catch(e) { /* Private/missing/offline images retain the local fallback. */ }
    },
    onTap() {
      if(this.data.memory)this.triggerEvent('open', { id: this.data.memory.id });
    },
    onPhotoError() {
      if(this._photoDetached||this.data.photoSrc===photos.meal)return;
      this.setData({photoSrc:photos.meal});
      if(isCloudImage(this._photoSource)&&!this._photoRetried){this._photoRetried=true;return this.loadPhoto(this._photoSource,true);}
    },
  },
});
