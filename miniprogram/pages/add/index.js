const identity = require('../../utils/identity');
const identityCopy = require('../../utils/identityCopy');
const localDate = require('../../utils/localDate');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Add — port of the web AddScreen. Draft persists in savor-draft-v1;
// photos go through wx.chooseMedia → compress → USER_DATA_PATH before
// their paths ever reach the store.
const store = require('../../utils/store');
const data = require('../../utils/data');
const photos = require('../../utils/photos');
const metrics = require('../../utils/metrics');
const locations = require('../../utils/locations');
const shareImport = require('../../utils/shareImport');
const categories = require('../../utils/restaurantCategory');
const diningTypeOptions = require('../../utils/diningTypeOptions');
const cloudRecords = require('../../utils/cloudRecords');
const importPolicy = require('../../utils/importPolicy');


Page({
  onFieldFocus: uiFeedback.onFieldFocus,
  onFieldBlur: uiFeedback.onFieldBlur,
  onImageError: uiFeedback.onImageError,
  data: {
    focusedField: '', imageErrors: {},
    copy: i18n.copy(), locale: i18n.locale(),
    headerTop: 60,
    draft: store.freshDraft(),
    knownPlace: null,
    suggestedTags: [],
    today: '',
    uploading: false,
    saving: false,
    error: '', errorContext: 'save', errorField: '', fieldErrors: {},
    showTagInput: false,
    tag: '',
    importOpen: false, importText: '', importCandidate: null, importSourceIndex: 0,
    cloudPlaceSearchEnabled:require('../../utils/importPolicy').cloudPlaceSearchEnabled, importLookupError:'', importCity:'', importMatches:[], importSearching:false, importSearchDone:false, importTypes:[],
    dusk: false,
    quiet: false,
    uploadProgress: 0,
    uploadTotal: 0,
    uploadCurrent: 0,
    originalMode: false,
    saveProgress: 0,
    saveProgressText: '',
    // Quick-clear feedback: the morph pair plus a short-lived local flag. Neither is
    // persisted; the flag only swallows taps while Eraser -> Check -> Eraser runs.
    clearingDraft: false,
    clearIcon: {name: 'eraser', fromName: 'eraser', key: 0},
    // Resident dining types: the picker offers built-ins minus the hidden ones plus the custom
    // names. Managing that list never edits the current draft.
    diningTypeManagerOpen: false,
    diningTypeInputOpen: false,
    diningTypeInput: '',
    diningTypeError: '',
    managedBuiltins: [],
    managedCustom: [],
  },

  onLoad() {
    let capsule = { top: 0, height: 32, borderRadius: 16 };
    try {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.top) {
        capsule = { top: rect.top, height: rect.height, borderRadius: rect.height/2, left: rect.left, width: rect.width };
      }
    } catch(e) {}
    this.setData({
      headerTop: metrics.getMetrics().headerTop,
      draft: store.loadDraft(),
      today: localDate.today(),
      menuButtonTop: capsule.top,
      menuButtonHeight: capsule.height,
      menuButtonBorderRadius: capsule.borderRadius,
      menuButtonLeft: capsule.left,
      menuButtonWidth: capsule.width,
    });
    this.saveLock = false;
    this.disposed = false;
    this.unsubscribe = store.subscribe(this.syncContext.bind(this));
    this.syncContext(store.get());
  },

  onUnload() {
    this.disposed = true;
    if (this.clearFeedbackTimer) { clearTimeout(this.clearFeedbackTimer); this.clearFeedbackTimer = null; }
    this.releaseNativeImportShow();
    this.releaseNativePhotoShow();
    if (this.unsubscribe) this.unsubscribe();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    try {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.top) {
        this.setData({
          menuButtonTop: rect.top,
          menuButtonHeight: rect.height,
          menuButtonBorderRadius: rect.height/2,
          menuButtonLeft: rect.left,
          menuButtonWidth: rect.width,
        });
      }
    } catch(e) {}
    this.setData({imageErrors:{},focusedField:''});
    this.setData({ headerTop: metrics.getMetrics(true).headerTop });
    this.setData({today:localDate.today(),cloudPlaceSearchEnabled:importPolicy.enabled()});
    this.active = true;
    const state = store.get();
    // Never re-read the draft from a locked storage boundary: that read cannot see this
    // owner's partition, so it would fabricate a fresh draft and overwrite the projection
    // the user is looking at. Keep it; syncContext rehydrates from the verified partition
    // the moment verification lands.
    if (!this.saveLock && !(state.identity && state.identity.locked)) this.setData({ draft: store.loadDraft() });
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(2, this._tabAppearance);
    this.syncContext(state);
    this.releaseNativeImportShow();
    this.releaseNativePhotoShow();
  },

  onHide() { this.active = false; },

  onPageScroll(event) { this._nativeScrollTop = event.scrollTop; },

  // The verification window is a short fence, not a blank page: the owner of this draft is
  // not established yet, so no business mutation may be accepted. Accepting one would show
  // the user a value the unlock rehydrate then discards. The form stays visible and readable;
  // every mutation entry point becomes inert, and the business inputs are disabled in WXML.
  identityFence() { return this.data.identityReady === false; },

  // The 万能导入 editor lives only in page memory, so a confirmed owner change must clear it here
  // instead of relying on a storage re-read. Never called for a transient locked window.
  clearImportEditor() {
    this.resetImportLookup();
    this.setData({importOpen:false,importText:'',importCandidate:null,importMatches:[],importCity:'',importLookupError:'',importSearching:false,importSearchDone:false,importSourceIndex:0});
  },

  syncContext(state) {
    const wasReady = this.data.identityReady;
    // Rehydrate BEFORE the view is told the identity is ready. Verification already kept the
    // old projection alive, so a verified owner must never be paired with the previous owner's
    // draft — not even inside one synchronous batch. A same-generation verified notification is
    // not a new account reset; a locked session never rehydrates.
    if (wasReady === false && state.identity && !state.identity.locked && !this.saveLock) {
      this.setData({draft:store.loadDraft()});
    }
    i18n.syncPage(this, state, 2);
    this.setData({businessFrozen:identity.isDiagnosisActive(),identityLabels:identityCopy()});
    // A CONFIRMED owner change discards the previous owner's in-memory editor state. The draft is
    // re-read from the new partition above; the 万能导入 editor has no durable copy of its own, so
    // it is cleared here. A transient locked/verifying window is not a confirmed change: it keeps
    // whatever the user was looking at and clears nothing.
    const owner = state.identity && state.identity.userId;
    if (owner && this._verifiedOwner && this._verifiedOwner !== owner) this.clearImportEditor();
    if (owner) this._verifiedOwner = owner;
    const draft = this.data.draft;
    const knownPlace = state.memories.find(function (memory) {
      return memory.restaurant.toLowerCase() === draft.restaurant.trim().toLowerCase();
    }) || null;
    const suggestedTags = [];
    state.settings.cuisines.forEach(function (c) { if (draft.tags.indexOf(c) < 0) suggestedTags.push(c); });
    if (state.settings.dietary !== 'No restrictions' && draft.tags.indexOf(state.settings.dietary) < 0) {
      suggestedTags.push(state.settings.dietary);
    }
    ['Lunch', 'Travel', 'Favorite'].forEach(function (c) {
      if (draft.tags.indexOf(c) < 0 && suggestedTags.indexOf(c) < 0) suggestedTags.push(c);
    });
    this.setData({
      knownPlace: knownPlace,
      suggestedTags: suggestedTags.slice(0, 4),
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
      draftClearable: this.draftHasContent(),
      formTypes:this.diningTypeRows(state.settings, draft),
      managedBuiltins:this.managedBuiltinRows(state.settings),
      managedCustom:this.managedCustomRows(state.settings),
    });
  },

  // The picker shows the resident options: built-ins minus the hidden ones, plus the custom names.
  // A value that is already on the draft stays selected even after its option is hidden or removed —
  // the draft is the user's data, the option list is only what the picker offers next.
  diningTypeRows(settings, draft) {
    const selected = Array.isArray(draft.diningTypes) ? draft.diningTypes : [];
    return diningTypeOptions.options(settings).visible.map(name => ({name, label: i18n.t(name), selected: selected.includes(name)}));
  },
  // The manager lists every built-in (hidden ones included, so they can be restored) and the custom
  // names. restaurantCategory.TYPES is never mutated.
  managedBuiltinRows(settings) {
    const hidden = diningTypeOptions.normalizeHidden(settings && settings.hiddenDiningTypes);
    return categories.TYPES.map(name => ({name, label: i18n.t(name), hidden: hidden.includes(name)}));
  },
  managedCustomRows(settings) {
    return diningTypeOptions.normalizeCustom(settings && settings.customDiningTypes).map(name => ({name, label: name}));
  },

  // A quick clear is only worth offering when the draft actually holds something. While an
  // existing memory is being edited the draft carries that edit, so abandoning it is a
  // different action with its own exits and the button stays away.
  draftHasContent() {
    const draft = this.data.draft;
    if (!draft || draft.editBase) return false;
    return Boolean((draft.restaurant && draft.restaurant.trim())
      || (draft.notes && draft.notes.trim())
      || (draft.cuisine && draft.cuisine.trim())
      || (draft.dishes && String(draft.dishes).trim())
      || (draft.city && draft.city.trim())
      || (draft.country && draft.country.trim())
      || draft.location
      || draft.rating
      || (draft.perCapita !== '' && draft.perCapita !== null && draft.perCapita !== undefined)
      || (Array.isArray(draft.tags) && draft.tags.length)
      || (Array.isArray(draft.photos) && draft.photos.length));
  },

  changeDraft(key, value, options) {
    if (this.identityFence()) return;
    if (this.saveLock) return;
    if(this.data.draft.editOperationId) {store.notify(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.')); return;}
    if (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted) {
      store.notify(i18n.t('The previous save needs confirmation. Tap Save again before editing.'));
      return;
    }
    const draft = Object.assign({}, this.data.draft);
    delete draft.cloudAttempt;
    // The restaurant text and the picked map location are two independent fields: editing
    // the name must never discard the location the user chose. Everything else derived from
    // the previous name is still dropped when the name changes; keepRelated preserves it for
    // the POI auto-naming that happens on the same pick.
    if (key === 'restaurant' && !(options && options.keepRelated)) { delete draft.sourcePlatform; delete draft.sourceUrl; delete draft.diningMode; delete draft.importAddressHint;delete draft.importAreaText;delete draft.platformRating;delete draft.platformAveragePriceCny;delete draft.diningTypes;delete draft.sourceCategory;delete draft.categorySource; }
    draft[key] = value;
    if(key==='cuisine'||key==='diningTypes')draft.categorySource='user-confirmed';
    this.setData({ draft: draft, fieldErrors:{},errorField:'',error:'' });
    if(!store.saveDraft(draft))this.setData({error:identityCopy().draftFailed,errorContext:'save',errorField:''});
    this.syncContext(store.get());
  },

  // ---------- photos ----------
  onReplacePhoto() {
    if (this.data.uploading || this.saveLock || (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted)) return;
    if (this.data.draft.photos.length >= 9) {
      store.notify(i18n.t('You can keep up to nine photos in one memory.'));
      return;
    }
    const available = 9 - this.data.draft.photos.length;
    // Unified: left "留住这一刻" also supports multi like right side
    this.pickPhotos(available, true);
  },
  onAddMore() {
    if (this.data.uploading || this.saveLock || (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted)) return;
    if (this.data.draft.photos.length >= 9) {
      store.notify(i18n.t('You can keep up to nine photos in one memory.'));
      return;
    }
    const available = 9 - this.data.draft.photos.length;
    this.pickPhotos(available, false);
  },
  onRemoveExtra() {
    if (this.saveLock || this.data.uploading || (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted)) return;
    const draft = this.data.draft;
    const removed = draft.photos[draft.photos.length - 1];

    this.changeDraft('photos', draft.photos.slice(0, -1));
  },
  pickPhotos(count, replace) {
    if (this.identityFence()) return;
    let token;
    try { token=identity.lease(); } catch (e) { this.setData({ uploading:false, error: e.message }); return; }
    const that = this;
    // One native chooser round trip per request. A system chooser hides the mini program, so
    // App.onShow re-verifies identity before this page is visible again: the picker callback must
    // not start persistence, and only the newest request may hand a photo to the draft.
    const serial = this.nativePhotoSerial = (this.nativePhotoSerial || 0) + 1;
    const visibleAgain = new Promise(resolve => { this._nativePhotoShow = {serial, resolve}; });
    const waitVisible = () => (!this.active && this._nativePhotoShow && this._nativePhotoShow.serial === serial) ? visibleAgain : Promise.resolve();
    this.setData({ uploading: true, uploadProgress: 0, uploadTotal: count, uploadCurrent: 0, originalMode: false, error: '', errorContext:'save',errorField:'',fieldErrors:{} });
    photos.choosePhotos(count, { waitVisible }, function(p){
      that.setData({
        uploadProgress: p.percent || 0,
        uploadCurrent: p.current || 0,
        uploadTotal: p.total || count,
        originalMode: !!p.original
      });
    }).then(async function (paths) {
      that.setData({ uploadProgress: 100, uploadCurrent: paths.length, uploadTotal: paths.length });
      await new Promise(r=>setTimeout(r, 300));

      let resumed = true;
      try { token=await identity.resumeNative(token); } catch (e) { resumed = false; }
      // A superseded request, an unloaded page, a failed resume or a different owner never
      // inherits this selection; nothing is written for another owner's draft.
      if (serial !== that.nativePhotoSerial || that.disposed || !resumed || !identity.isCurrent(token)) {
        if (!that.disposed && serial === that.nativePhotoSerial) that.setData({ uploading: false });
        return;
      }
      if (!paths || !paths.length) {
        that.setData({ uploading: false, error: i18n.t('Could not prepare the photo. Please select it again.') });
        return;
      }
      const draft = that.data.draft;
      let next;
      if (replace) {
        next = paths.concat(draft.photos.slice(1)).slice(0, 9);
      } else {
        next = draft.photos.concat(paths).slice(0, 9);
      }
      const newDraft = Object.assign({}, draft, { photos: next });
      delete newDraft.cloudAttempt;
      if(!store.saveDraft(newDraft)) {
        that.setData({ uploading: false, error: require('../../utils/identityCopy')().draftFailed });
        return;
      }
      that.setData({ uploading: false, uploadProgress: 100, draft: newDraft, fieldErrors:{},errorField:'',error:'' });
      that.syncContext(store.get());
      // The chooser can drop an unreadable original; never let a partial selection look complete.
      if (paths.failures && paths.failures.length) store.notify(i18n.t('Some photos could not be prepared. Reselect them and try again.'));
      setTimeout(()=>{ if(!that.data.uploading) that.setData({uploadProgress:0, uploadTotal:0, uploadCurrent:0}); }, 800);
    }).catch(function (error) {
      if (serial !== that.nativePhotoSerial) return; // a newer request owns the upload UI now
      if (that.disposed) {
        that.setData({ uploading: false });
        return;
      }
      const msg = String(error && (error.errMsg || error.message) || '');
      const cancelled = /cancel/i.test(msg);
      if(token && !identity.isCurrent(token) && !cancelled) {
        that.setData({ uploading: false });
        return;
      }
      that.setData({ uploading: false, error: cancelled ? '' : (msg.includes('IDENTITY') ? error.message : i18n.t('Could not prepare the photo. Please select it again.')) });
    });
  },

  onPreviewPhoto(event) { const paths=this.data.draft.photos; if(paths.length) wx.previewImage({current:paths[Number(event.currentTarget.dataset.index)||0],urls:paths}); },
  onRemovePhoto(event) {
    if(this.saveLock || this.data.uploading || this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted) return;
    const index=Number(event.currentTarget.dataset.index), list=this.data.draft.photos;
    this.changeDraft('photos',list.filter((_,i)=>i!==index));
  },
  onBusinessField(event) { this.changeDraft(event.currentTarget.dataset.field,event.detail.value); },
  onGeoField(event) { const pick=Object.assign({},this.data.draft.location); pick[event.currentTarget.dataset.field]=event.detail.value.trim(); pick.geoConfirmed=!!pick.city&&!!pick.country; pick.geoSource='user-confirmed'; this.changeDraft('location',pick); },
  // ---------- fields ----------
  onRestaurant(event) { this.changeDraft('restaurant', event.detail.value); },
  onRestaurantClear() { this.changeDraft('restaurant', ''); },
  onNotes(event) { this.changeDraft('notes', event.detail.value); },
  onDate(event) { this.changeDraft('date', event.detail.value); },
  onRating(event) { const value=Number(event.currentTarget.dataset.value);this.changeDraft('rating', value);this.changeDraft('ratingSource',value?'single':'unrated'); },

  onToggleTagInput() {
    this.setData({ showTagInput: !this.data.showTagInput, tag: '' });
  },
  onTagInput(event) { this.setData({ tag: event.detail.value }); },
  onTagConfirm() {
    const value = this.data.tag.trim().slice(0, 24);
    const draft = this.data.draft;
    const exists = draft.tags.some(function (t) { return t.toLowerCase() === value.toLowerCase(); });
    if (value && !exists && draft.tags.length < 6) {
      this.changeDraft('tags', draft.tags.concat([value]));
    }
    this.setData({ tag: '', showTagInput: false });
  },
  onSuggestedTag(event) {
    const value = event.currentTarget.dataset.value;
    const draft = this.data.draft;
    if (draft.tags.length < 6 && draft.tags.indexOf(value) < 0) {
      this.changeDraft('tags', draft.tags.concat([value]));
    }
    this.setData({ showTagInput: false });
  },
  onRemoveTag(event) {
    const value = event.currentTarget.dataset.value;
    const draft = this.data.draft;
    this.changeDraft('tags', draft.tags.filter(function (t) { return t !== value; }));
  },

  showFieldError(field, message) {
    const errors = {}; errors[field] = message;
    this.setData({error:message,errorContext:'save',errorField:field,fieldErrors:errors,saving:false}, () => {
      if(!this.disposed && wx.pageScrollTo) wx.pageScrollTo({selector:'#field-'+field,duration:this.data.quiet?0:200,fail:()=>{}});
    });
  },

  // ---------- save ----------
  onSave() {
    if (this.identityFence()) return;
    if(identity.isDiagnosisActive()){this.setData({error:identityCopy().frozen,errorContext:'save',errorField:''});return;}
    let token;try{token=identity.lease();}catch(e){this.setData({error:e.message,errorContext:'save',errorField:''});return;}
    if (this.saveLock || this.data.uploading) return;
    this.setData({error:'',errorContext:'save',errorField:'',fieldErrors:{}});
    const draft = this.data.draft;
    if(draft.editOperationId) {
      this.saveLock=true;this.setData({saving:true});
      return store.createCloudMemory(draft.editBase,draft).then(()=>{if(identity.isCurrent(token)&&!this.disposed)this.setData({draft:store.freshDraft(),error:''});if(this.active&&!this.disposed&&identity.isCurrent(token)) wx.switchTab({url:'/pages/home/index'});}).catch(e=>{if(identity.isCurrent(token)&&!this.disposed)this.setData({error:i18n.t(e.message)});}).finally(()=>{this.saveLock=false;if(!this.disposed)this.setData({saving:false});});
    }
    if (!draft.restaurant.trim()) {
      this.showFieldError('restaurant', i18n.t('Give this memory a restaurant or place name.'));
      return;
    }
    if (!data.isValidDate(draft.date)) {
      this.showFieldError('date', i18n.t('Choose a date for your memory.'));
      return;
    }
    if (!Number.isFinite(Number(draft.perCapita || 0)) || Number(draft.perCapita || 0)<0 || Number(draft.perCapita || 0)>1000000) { this.showFieldError('perCapita',i18n.t('Enter a valid per-person cost.')); return; }
    this.saveLock = true;
    this.setData({ saving: true, saveProgress: 10, saveProgressText: '准备保存...' });
    const state = store.get();

    const known = this.data.knownPlace;
    const locationPick = locations.confirmed(draft.location) ? draft.location : draft.cloudAttempt && draft.cloudAttempt.submitted ? draft.cloudAttempt.memory : null;
    // Location now optional per user request — no forced Tencent Map selection
    if (locationPick && !!locationPick.city !== !!locationPick.country) {this.saveLock=false;this.showFieldError('geography',i18n.t('Location city and country must be confirmed together.'));return;}
    const memory = {
      id: data.createId(),
      restaurant: draft.restaurant.trim(),
      importAddressHint:draft.importAddressHint||'',importAreaText:draft.importAreaText||'',platformRating:draft.platformRating==null?null:draft.platformRating,platformAveragePriceCny:draft.platformAveragePriceCny==null?null:draft.platformAveragePriceCny,
      diningMode: draft.diningMode || '', sourcePlatform: draft.sourcePlatform || '', sourceUrl: draft.sourceUrl || '',
      notes: draft.notes.trim(),
      date: draft.date,
      rating: draft.rating,
      tags: draft.tags.slice(),
      cuisine: (draft.cuisine || '').trim(),
      diningTypes:(Array.isArray(draft.diningTypes)?draft.diningTypes:[]).slice(),sourceCategory:draft.sourceCategory||'',categorySource:draft.categorySource||'',tencentPoiId:(locationPick && locationPick.tencentPoiId)||'',
      perCapita: draft.perCapita === '' ? 0 : Number(draft.perCapita || 0),
      dishes: Array.isArray(draft.dishes) ? draft.dishes : String(draft.dishes || '').split(/[，,\n]/).map(s=>s.trim()).filter(Boolean),
      ratingSource: draft.ratingSource || (draft.rating ? 'single' : 'unrated'),
      photo: draft.photos[0] || data.photos.meal,
      noPhoto: !draft.photos.length,
      extraPhotos: draft.photos.slice(1),
      placePhoto: draft.editBase ? draft.editBase.placePhoto : undefined,
      city: (locationPick && locationPick.city) || '',
      country: (locationPick && locationPick.country) || '',
      geoConfirmed: locationPick ? locationPick.geoConfirmed === true : false, geoSource: locationPick ? (locationPick.geoSource || 'unknown') : 'manual',
      neighborhood: '',
      coordinates: locationPick && locationPick.coordinates ? locationPick.coordinates : [39.9042, 116.4074],
      address: locationPick ? locationPick.address : undefined,
      locationName: locationPick ? locationPick.locationName : undefined,
      locationSource: locationPick ? locationPick.locationSource : undefined,
      coordinateSystem: locationPick ? locationPick.coordinateSystem : undefined,
      locationUnknown: !locationPick,
      shared: !state.settings.privateByDefault,
      liked: false,
      saved: false,
    };
    const thatSave = this;
    const saveProgressInterval = setInterval(()=>{
      if (thatSave.data.saveProgress < 90) {
        thatSave.setData({ saveProgress: thatSave.data.saveProgress + 5, saveProgressText: thatSave.data.saveProgress < 50 ? '上传照片到云端...' : '同步到云端...' });
      }
    }, 400);
    return store.createCloudMemory(memory, draft).then(() => {
      clearInterval(saveProgressInterval);
      if(identity.isCurrent(token)&&!thatSave.disposed) thatSave.setData({ draft: store.freshDraft(), error: '', showTagInput: false, tag: '', saveProgress: 100, saveProgressText: '保存成功' });
      store.notify(i18n.t('A little moment, kept forever. Memory saved.'));
      setTimeout(()=>{ if (thatSave.active && !thatSave.disposed && identity.isCurrent(token)) wx.switchTab({ url: '/pages/home/index' }); }, 400);
    }).catch(error => {
      clearInterval(saveProgressInterval);
      if(identity.isCurrent(token)&&!thatSave.disposed) thatSave.setData({ error: i18n.t(error.message) || i18n.t('Save failed. Your draft is kept.'), draft: draft, saveProgress: 0, saveProgressText: '' });
    }).finally(() => {
      clearInterval(saveProgressInterval);
      thatSave.saveLock = false;
      if (!thatSave.disposed) thatSave.setData({ saving: false });
      setTimeout(()=>{ if(!thatSave.data.saving) thatSave.setData({saveProgress:0, saveProgressText:''}); }, 1000);
    });
  },

  onChooseRestaurantLocation() {
    if (this.identityFence()) return;
    let token=identity.lease();
    if (this.saveLock || this.locating) return;
    if (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted) {
      store.notify(i18n.t('请先点击 Save 确认上一次保存结果。')); return;
    }
    this.locating = true;
    return locations.choose(this.data.draft.location).then(async pick => {
      token=await identity.resumeNative(token);
      if (this.disposed) return;
      // The POI name only ever seeds the memory: it is applied on the pick where the user
      // has not typed a name yet, and never again afterwards. keepRelated keeps the dining
      // types the user already chose while the name is seeded.
      if (!this.data.draft.restaurant.trim() && pick.locationName) this.changeDraft('restaurant', pick.locationName, {keepRelated: true});
      this.changeDraft('location', pick);
      this.setData({ error: '' });
    }).catch(error => {
      if (!identity.isCurrent(token))return;
      if (!error.cancelled && !this.disposed) this.setData({ error: i18n.t(error.message) });
    }).finally(() => { this.locating = false; });
  },

  importBlocked() {
    const d = this.data.draft;
    return this.saveLock || this.data.uploading || this.locating || d.editingId || d.editOperationId || d.cloudAttempt;
  },
  onUniversalImport() {
    if (this.identityFence()) return;
    if (this.importBlocked()) { store.notify(i18n.t('Finish the current save or edit before importing another restaurant.')); return; }
    this.setData({ importOpen: !this.data.importOpen, error: '', errorContext:'import',errorField:'',fieldErrors:{} });
  },
  onImportCancel() { if (this.identityFence()) return; this.resetImportLookup();this.setData({ importOpen: false, importText: '', importCandidate: null, error: '' }); },
  onImportText(e) { if (this.identityFence()) return; this.resetImportLookup();this.setData({ importText: e.detail.value, importCandidate: null, error: '' }); },
  onImportSource(e) { if (this.identityFence()) return; this.resetImportLookup();this.setData({ importSourceIndex: Number(e.detail.value), importCandidate: null, error: '' }); },
  importError(error) {
    const messages = { TEXT_REQUIRED: 'Paste some share text first.', TEXT_TOO_LONG: 'Share text is too long (maximum 6000 characters).', ONE_SHOP_ONLY: 'Import one shop at a time.', SOURCE_REQUIRED: 'Check the selected source platform.', SOURCE_MISMATCH: 'Check the selected source platform.', NAME_REQUIRED: 'Enter a restaurant name up to 70 characters.', NAME_TOO_LONG: 'Enter a restaurant name up to 70 characters.', DRAFT_LOCKED: 'Finish the current save or edit before importing another restaurant.' };
    this.setData({ errorContext:'import', error: i18n.t(messages[error.code] || 'Could not persist the draft. Existing inputs are kept.') });
  },
  onImportParse() {
    if (this.identityFence()) return; 
    if (this.importBlocked()) return;
    this.resetImportLookup();
    try {
      const candidate = shareImport.parse(this.data.importText, ['dianping','meituan','other-delivery'][this.data.importSourceIndex]);
      this.updateImportCandidate(candidate);this.setData({error:''});
    } catch (e) { this.setData({ importCandidate: null }); this.importError(e); }
  },
  releaseNativeImportShow() {
    const waiting = this._nativeImportShow;
    this._nativeImportShow = null;
    if (waiting) waiting.resolve();
  },
  // The photo picker and the location chooser are independent native operations: each owns its
  // own waiter and request serial, so releasing one never resumes the other.
  releaseNativePhotoShow() {
    const waiting = this._nativePhotoShow;
    this._nativePhotoShow = null;
    if (waiting) waiting.resolve();
  },

  resetImportLookup() {
    this.releaseNativeImportShow();
    this.nativeImportSerial = (this.nativeImportSerial || 0) + 1;
    this.lookupSerial=(this.lookupSerial||0)+1;
    this.setData({importMatches:[],importSearching:false,importSearchDone:false,importLookupError:''});
  },
  updateImportCandidate(candidate) {
    candidate=Object.assign({},candidate,{categorySuggestionText:[candidate.categorySuggestion&&candidate.categorySuggestion.cuisine].concat(candidate.categorySuggestion&&candidate.categorySuggestion.diningTypes||[]).filter(Boolean).join(' · ')});
    this.setData({importCandidate:candidate,importTypes:categories.TYPES.map(name=>({name,label:i18n.t(name),selected:(candidate.diningTypes||[]).includes(name)}))});
  },
  onImportName(e) {
    if (this.identityFence()) return; 
    if(!this.data.importCandidate||e.detail.value===this.data.importCandidate.name)return;
    this.resetImportLookup();
    this.updateImportCandidate(Object.assign({},this.data.importCandidate,{name:e.detail.value,confirmedLocation:null,address:'',areaText:'',platformRating:null,platformAveragePriceCny:null,sourceUrl:'',cuisine:'',diningTypes:[],sourceCategory:'',categorySource:'',categorySuggestion:categories.suggestion(e.detail.value)}));
  },
  onImportCity(e) { if (this.identityFence()) return; this.resetImportLookup();this.setData({importCity:e.detail.value});},
  onImportCuisine(e) {
    if (this.identityFence()) return; 
    if(this.data.importCandidate)this.updateImportCandidate(Object.assign({},this.data.importCandidate,{cuisine:e.detail.value,categorySource:'user-confirmed'}));
  },
  onDraftDiningType(e) {
    if (this.identityFence()) return;
    const type=e.currentTarget.dataset.value;
    if(!diningTypeOptions.options(store.get().settings).visible.includes(type))return;
    const list=(Array.isArray(this.data.draft.diningTypes)?this.data.draft.diningTypes:[]).slice(),index=list.indexOf(type);if(index>=0)list.splice(index,1);else if(list.length<6)list.push(type);
    this.changeDraft('diningTypes',list);
  },

  // ---- resident dining types: the picker's option list, never the draft's content ----
  diningTypeErrorText(reason) {
    if (reason === 'DUPLICATE') return i18n.t('This type already exists.');
    if (reason === 'TOO_LONG') return i18n.t('Keep it within {max} characters.', {max: diningTypeOptions.MAX_ITEM_LENGTH});
    if (reason === 'LIMIT') return i18n.t('You can keep up to {max} dining types.', {max: diningTypeOptions.MAX_CUSTOM});
    return i18n.t('Enter a type name.');
  },
  saveDiningTypes(changes) {
    try { store.updateSettings(changes); this.setData({diningTypeError: ''}); return true; }
    catch (error) { this.setData({diningTypeError: i18n.t('Could not save this preference. Please try again.')}); return false; }
  },
  onDiningTypeManager() {
    if (this.identityFence()) return;
    this.setData({diningTypeManagerOpen: !this.data.diningTypeManagerOpen, diningTypeInputOpen: false, diningTypeInput: '', diningTypeError: ''});
  },
  onDiningTypeInput(e) { if (this.identityFence()) return; this.setData({diningTypeInput: e.detail.value, diningTypeError: ''}); },
  onAddDiningType() { if (this.identityFence()) return; this.setData({diningTypeInputOpen: true, diningTypeInput: '', diningTypeError: ''}); },
  onDiningTypeInputCancel() { if (this.identityFence()) return; this.setData({diningTypeInputOpen: false, diningTypeInput: '', diningTypeError: ''}); },
  // Adding a resident option only makes it available; it never selects it on the current draft.
  onDiningTypeConfirm() {
    if (this.identityFence()) return;
    const result = diningTypeOptions.addCustom(store.get().settings, this.data.diningTypeInput);
    if (!result.ok) { this.setData({diningTypeError: this.diningTypeErrorText(result.reason)}); return; }
    if (!this.saveDiningTypes({customDiningTypes: result.custom})) return;
    this.setData({diningTypeInputOpen: false, diningTypeInput: ''});
  },
  // Hiding and removing only change future options. The current draft, every stored memory and
  // restaurantCategory.TYPES keep their values; a hidden built-in can be restored later.
  onHideDiningType(e) {
    if (this.identityFence()) return;
    this.saveDiningTypes({hiddenDiningTypes: diningTypeOptions.hideBuiltin(store.get().settings, e.currentTarget.dataset.value)});
  },
  onRestoreDiningType(e) {
    if (this.identityFence()) return;
    this.saveDiningTypes({hiddenDiningTypes: diningTypeOptions.restoreBuiltin(store.get().settings, e.currentTarget.dataset.value)});
  },
  onRemoveDiningType(e) {
    if (this.identityFence()) return;
    this.saveDiningTypes({customDiningTypes: diningTypeOptions.removeCustom(store.get().settings, e.currentTarget.dataset.value)});
  },
  onImportType(e) {
    if (this.identityFence()) return; 
    const c=this.data.importCandidate,t=e.currentTarget.dataset.value;if(!c||!categories.TYPES.includes(t))return;
    const list=(c.diningTypes||[]).slice(),index=list.indexOf(t);if(index>=0)list.splice(index,1);else if(list.length<6)list.push(t);
    this.updateImportCandidate(Object.assign({},c,{diningTypes:list,categorySource:'user-confirmed'}));
  },
  onAcceptCategorySuggestion() {
    if (this.identityFence()) return; 
    const c=this.data.importCandidate;if(!c)return;
    this.updateImportCandidate(Object.assign({},c,{cuisine:c.cuisine||c.categorySuggestion.cuisine,diningTypes:Array.from(new Set((c.diningTypes||[]).concat(c.categorySuggestion.diningTypes||[]))).slice(0,6),categorySource:'user-confirmed'}));
  },
  onCloudSearchToggle(e) {
    if (this.identityFence()) return; 
    const enable=e.detail.value===true;
    this.searchPreferenceSerial=(this.searchPreferenceSerial||0)+1;
    const serial=this.searchPreferenceSerial;
    const apply=()=>{
      if(this.disposed||serial!==this.searchPreferenceSerial)return;
      this.resetImportLookup();
      if(!importPolicy.setEnabled(enable))this.setData({error:i18n.t('Could not save this preference. Please try again.')});
      this.setData({cloudPlaceSearchEnabled:importPolicy.enabled()});
    };
    if(!enable){apply();return;}
    // Controlled switch stays off until explicit consent; opening never starts a request.
    this.setData({cloudPlaceSearchEnabled:false});
    i18n.modal({title:'Enable Tencent branch location search?',content:'This only searches Tencent Maps for a branch location, not the merchant share page or its images. Requests use Tencent and CloudBase quotas only when you tap Search.',success:r=>{if(r.confirm)apply();else if(!this.disposed&&serial===this.searchPreferenceSerial)this.setData({cloudPlaceSearchEnabled:importPolicy.enabled()});}});
  },
  async onImportSearch() {
    if (this.identityFence()) return; 
    if (!require('../../utils/importPolicy').cloudPlaceSearchEnabled) return this.onImportNativePick();
    if(this.importBlocked()||this.data.importSearching||!this.data.importCandidate)return;
    const c=this.data.importCandidate,id=this.lookupSerial=(this.lookupSerial||0)+1;
    this.setData({importSearching:true,importMatches:[],importSearchDone:false,importLookupError:'',error:''});
    try {
      const rows=await cloudRecords.searchPlaces(c.name,this.data.importCity);
      if(this.disposed||id!==this.lookupSerial||c!==this.data.importCandidate)return;
      this.setData({importMatches:rows,importSearchDone:true});
    }catch(e){if(!this.disposed&&id===this.lookupSerial)this.setData({importLookupError:i18n.t(e.message)});}
    finally{if(!this.disposed&&id===this.lookupSerial)this.setData({importSearching:false});}
  },
  onImportMatch(e) {
    if (this.identityFence()) return; 
    const p=this.data.importMatches[Number(e.currentTarget.dataset.index)];if(!p)return;
    const pick=locations.fromSearchPoi(p);if(!pick)return;
    this.confirmImportLocation(pick,p.categoryText);
  },
  async onImportNativePick() {
    if (this.identityFence()) return; 
    if(this.importBlocked()||!this.data.importCandidate)return;
    let token = identity.lease();
    const c = this.data.importCandidate;
    const serial = this.nativeImportSerial = (this.nativeImportSerial || 0) + 1;
    const visibleAgain = new Promise(resolve => { this._nativeImportShow = {serial, resolve}; });
    const scrollTop = this._nativeScrollTop || 0;
    const scene = {};
    ['importOpen','importText','importSourceIndex','importCity','importMatches','importSearchDone','importLookupError'].forEach(key => { scene[key] = this.data[key]; });
    this.locating = true;
    let pick, pickerError;
    try {
      try { pick = await locations.choose(c.confirmedLocation); }
      catch (error) { pickerError = error; }
      // Native cancel can arrive BEFORE Page.onShow / App verification starts.
      if (!this.active && this._nativeImportShow && this._nativeImportShow.serial === serial) await visibleAgain;
      // Cancellation also needs the normal same-owner verification handshake.
      token = await identity.resumeNative(token);
      identity.assertLease(token);
      if (this.disposed || !this.active || serial !== this.nativeImportSerial) return;
      this.updateImportCandidate(c);
      this.setData(Object.assign({}, scene, {importSearching:false}), () => {
        if (!this.disposed && this.active && serial === this.nativeImportSerial && identity.isCurrent(token) && wx.pageScrollTo) wx.pageScrollTo({scrollTop, duration:0});
      });
      this.syncContext(store.get());
      this.locating = false;
      if (pickerError) {
        if (!pickerError.cancelled) this.setData({error:i18n.t(pickerError.message)});
      } else this.confirmImportLocation(pick, '');
    } catch (error) { /* Failed/different identity stays gated; never restore its scene. */ }
    finally {
      if (this._nativeImportShow && this._nativeImportShow.serial === serial) this.releaseNativeImportShow();
      this.locating = false;
    }
  },
  confirmImportLocation(pick,categoryText) {
    const c=this.data.importCandidate;if(!c||this.importBlocked()||!locations.confirmed(pick))return;
    const serial=this.lookupSerial;
    const same=categories.compareBranch(c.name,pick.locationName)==='same-name';
    i18n.modal({title:'Confirm this branch',content:pick.locationName+'\n'+pick.address+'\n'+i18n.t(same?'Check the address and branch. Search results are not identity proof.':'The shop names differ. Check the city, branch and address before confirming.'),success:r=>{
      if(!r.confirm||this.disposed||this.data.importCandidate!==c||this.importBlocked()||serial!==this.lookupSerial)return;
      const next=shareImport.attachLocation(c,pick,categoryText);
      this.updateImportCandidate(next);
    }});
  },
  onImportApply() {
    if (this.identityFence()) return;
    if (this.importBlocked()) { this.importError({code:'DRAFT_LOCKED'}); return; }
    const original = this.data.draft, candidate = this.data.importCandidate;
    let next;
    try { next = shareImport.applyCandidate(original, candidate); } catch(e) { this.importError(e); return; }
    i18n.modal({ title: 'Replace the restaurant in this draft?', content: 'Notes, photos, ratings and actual cost stay unchanged. Choose the actual meal date and confirm the exact branch before saving. Nothing is saved to the cloud now.',
      success: result => {
        if (!result.confirm || this.disposed) return;
        if (this.importBlocked() || this.data.draft !== original || this.data.importCandidate !== candidate) {
          this.setData({error:i18n.t('The draft changed. Review the candidate and try again.')}); return;
        }
        if (!store.saveDraft(next)) { this.importError({}); return; }
        this.setData({ draft: next, importOpen: false, importCandidate: null, importText: '', error: '' },()=>{if(!this.disposed&&wx.pageScrollTo)wx.pageScrollTo({scrollTop:0,duration:this.data.quiet?0:200});});
        this.resetImportLookup();
        this.syncContext(store.get());
        store.notify(i18n.t('Candidate filled into draft. Reference details are kept separately; add the actual meal date, rating and cost yourself.'));
      }
    });
  },

  onClose() {
    wx.switchTab({ url: '/pages/home/index' });
    store.notify(i18n.t('Your draft is here whenever you are ready.'));
  },

  // One tap empties the draft: this is the quick-clear affordance, so there is no
  // confirmation step. The business action runs on the tap itself — the Eraser -> Check
  // morph only reports it — and a tap arriving mid-feedback is swallowed by the local
  // clearingDraft flag. changeDraft's guards apply so an in-flight save is never
  // discarded, and the draft is re-read from storage so a failed write can never show a
  // cleared form over stale bytes.
  onClearDraft() {
    if (this.identityFence()) return;
    if (this.data.clearingDraft) return;
    if (this.saveLock || this.data.uploading || this.locating) return;
    if (this.data.draft.editOperationId) { store.notify(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.')); return; }
    if (this.data.draft.cloudAttempt && this.data.draft.cloudAttempt.submitted) { store.notify(i18n.t('The previous save needs confirmation. Tap Save again before editing.')); return; }
    store.clearDraft();
    this.setData({
      draft: store.loadDraft(),
      error: '', errorContext: '', errorField: '', fieldErrors: {},
      importOpen: false, importText: '', importCandidate: null,
      showTagInput: false, tag: '',
      clearingDraft: true,
      clearIcon: {name: 'check', fromName: 'eraser', key: (this.data.clearIcon.key || 0) + 1},
    });
    this.syncContext(store.get());
    // Only the timer flips the feedback back. Reduce-motion still gets both states, just
    // without the morph timeline (the component's own quiet path).
    if (this.clearFeedbackTimer) clearTimeout(this.clearFeedbackTimer);
    this.clearFeedbackTimer = setTimeout(() => {
      this.clearFeedbackTimer = null;
      if (this.disposed) return;
      this.setData({
        clearingDraft: false,
        clearIcon: {name: 'eraser', fromName: 'check', key: (this.data.clearIcon.key || 0) + 1},
      });
    }, 640);
  },
});
