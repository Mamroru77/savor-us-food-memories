// memory-row — port of the web Primitives.MemoryRow.
const { formatDate } = require('../../utils/data');
const { photos, isCloudImage, isSafeImage } = require('../../utils/data');
const cloudRecords = require('../../utils/cloudRecords');

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
      this.loadPhoto(memory.placePhoto || memory.photo || photos.meal);
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
