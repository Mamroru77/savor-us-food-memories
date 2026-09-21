const identity = require('../../utils/identity');
const motionPresence = require('../../utils/motionPresence');
const localDate = require('../../utils/localDate');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// s-sheet — full port of the web Sheets.tsx: bottom sheet shell plus all
// eleven sheet contents (memory detail, library, profile, together,
// preferences, settings, privacy, weekly, journey, notifications, help).
const store = require('../../utils/store');
const headings = require('../../utils/pageHeadings');
const data = require('../../utils/data');
const photos = require('../../utils/photos');
const stats = require('../../utils/memoryStats');
const metrics = require('../../utils/metrics');

const DIETARY_OPTIONS = ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'];
const CUISINE_OPTIONS = ['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'];
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const FAQS = [
  { question: 'Where are my memories saved?', answer: 'New meals and changes to your cloud meals sync privately. Offline edits, favorites and deletions are kept in a local queue; check Sync status in Me. Samples and local-only imports are not auto-uploaded. Cloud photo files are retained after deletion.' },
  { question: 'How do I share a moment?', answer: 'Tap Show in Us to organize your own diary. This does not send a record or grant another account access. Shared space has separate consent and sharing controls.' },
  { question: 'Can I add my own photos?', answer: 'Tap Add to keep up to nine photos. Tap a photo for fullscreen preview, or remove any thumbnail.' },
];

const SHEET_TITLES = {
  sync: ['Sync status', 'Your changes, safely kept.'],
  personalize: ['Personalize', 'Make these words yours.'],
  memory: ['A little memory', 'A moment worth coming back to.'],
  library: ['Your memories', 'Small moments. A beautiful collection.'],
  profile: ['A little about you', 'Make this space feel like home.'],
  together: ['Our little world', 'Two people. One delicious story.'],
  preferences: ['Your kind of good', 'A diary with a taste for you.'],
  settings: ['The little details', 'Savor, just the way you like it.'],
  privacy: ['Just between us', 'A little space you can trust.'],
  weekly: ['A week to savor', 'Your little collection of good things.'],
  journey: ['Our journey', 'One meal, one place, one memory at a time.'],
  notifications: ['A little hello', 'The latest from your little world.'],
  help: ['Here for you', 'A little help, whenever you need it.'],
};

function withRows(memories) {
  return memories.map(function (memory) {
    return {
      id: memory.id,
      memory: memory,
      dateLabel: data.formatDate(memory.date),
      location: require('../../utils/locations').display(memory),
      photoSrc: memory.placePhoto || memory.photo || data.photos.meal,
    };
  });
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    // type: null = accept any — page bindings resolve a tick later and
    // transient nulls must not spam the console with type warnings.
    type: { type: null, value: '' },
    memoryId: { type: null, value: '' },
    filter: { type: null, value: '' },
    readingPosition: { type: Object, value: null },
  },

  data: {
    focusedField: '', imageErrors: {},
    copy: i18n.copy(), locale: i18n.locale(), sheetMounted:false, sheetClosing:false, displayType:'', quiet:false,
    languageOptions: i18n.options(), languageIndex: 0,
    sheetTop: 90, sheetScrollHeight: 0, sheetScrollTop: 0,
    personalizationRows: [], personalizationError: '', personalizationNameError: '',
    title: '',
    subtitle: '',
    dusk: false,
    // shared view model
    state: null,
    // memory detail
    detail: null,
    photoIndex: 0,
    confirmDelete: false,
    // library
    libraryTab: 'all',
    libraryQuery: '',
    libraryError: '',
    libraryRows: [],
    sheetScrollTarget:'',
    // together form
    partner: '',
    since: '',
    today: '',
    // preferences form
    dietary: 'No restrictions',
    dietaryOptions: DIETARY_OPTIONS,
    dietaryIndex: 0,
    cuisines: [],
    cuisineOptions: CUISINE_OPTIONS,
    // settings + privacy mirrors
    theme: 'pearl',
    reminders: true,
    reduceMotion: false,
    privateByDefault: false,
    showLocations: true,
    // weekly
    weeklyStats: null,
    weeklyBars: [],
    weeklyRows: [],
    // journey
    journeyStops: [],
    // notifications
    notifRows: [],
    // help
    faqs: FAQS, faqHeights: [],
    faqExpanded: -1,
    feedbackMessage: '',
  },

  observers: {
    'show, type, memoryId, filter': function () {
      const native=this._avatarNativeOwner;
      const preservingAvatar=!!native && (!this.data.type || this.data.type==='profile') && (this.data.show || identity.snapshot().status==='verifying');
      const formType=preservingAvatar?'profile':this.data.show?this.data.type:'';
      if(preservingAvatar&&!this.data.show)native.suspended=true;
      if(this.data.show&&this._avatarViewReady){this._avatarViewReady();this._avatarViewReady=null;}
      if(!preservingAvatar&&(this._formType!==formType||!this.data.show))this.resetFormEdits();
      if(!preservingAvatar||this.data.show)this._formType=formType;
      const readingKey = this.data.show && this.data.type === 'memory' ? this.data.memoryId : '';
      const enteringMemory = readingKey && readingKey !== this._readingKey;
      this._readingKey = readingKey;
      if (this.data.show) {this.setData({displayType:formType,imageErrors:{},focusedField:'',sheetScrollTarget:'',sheetTop:metrics.getMetrics(true).headerTop+8});this.refresh();}
      else this._personalizing = false;
      if (enteringMemory) {
        const position = this.data.readingPosition;
        const resume = position && position.memoryId === readingKey;
        this._readingScrollTop = resume ? Math.max(0, Number(position.scrollTop) || 0) : 0;
        this.setData({
          sheetScrollTarget: resume ? '' : 'memory-start',
          sheetScrollTop: this._readingScrollTop,
          photoIndex: resume ? Math.max(0, Number(position.photoIndex) || 0) : 0,
        });
      }
      motionPresence.update(this,'sheet',this.data.show,this.data.quiet);
    },
  },

  lifetimes: {
    attached() {
      this.setData({ sheetTop: metrics.getMetrics().headerTop + 8 });
      this._onResize = () => { if(this._detached)return; this.setData({ sheetTop: metrics.getMetrics(true).headerTop + 8, sheetScrollHeight: 0 }, () => this.measureScroll()); };
      if (wx.onWindowResize) wx.onWindowResize(this._onResize);
      this.unsubscribe = store.subscribe(function (state) {
        const session=state.identity;
        if(this._avatarNativeOwner&&session){
          if(session.locked&&session.status==='verifying'){
            this._identityGeneration=session.generation;
            return;
          }
          if(session.locked||session.userId!==this._avatarNativeOwner.userId){
            this.resetFormEdits();
            this._personalizing=false;
            this.setData({detail:null,libraryRows:[],libraryQuery:'',feedbackMessage:'',state:{},syncRows:[]});
            this.triggerEvent('close', {reason:'identity'});return;
          }
          this._identityGeneration=session.generation;
        } else if(session && this._identityGeneration!==session.generation){
          this._identityGeneration=session.generation;
          this.resetFormEdits();
          this._personalizing=false;
          this.setData({detail:null,libraryRows:[],libraryQuery:'',feedbackMessage:'',state:{},syncRows:[]});
          this.triggerEvent('close', {reason:'identity'});return;
        }
        if (this.data.show) this.refresh();
      }.bind(this));
      try {
        const state = store.get();
        this._identityGeneration=state.identity&&state.identity.generation;
        this.setData({ dusk: state.settings.theme === 'dusk', today: localDate.today() });
      } catch (error) { /* fall back to light theme */ }
    },
    detached() {
      this._detached = true;
      this.resetFormEdits();
      motionPresence.dispose(this);
      if (wx.offWindowResize && this._onResize) wx.offWindowResize(this._onResize);
      if (this.unsubscribe) this.unsubscribe();
    },
  },

  methods: {
    onFieldFocus: uiFeedback.onFieldFocus,
    onFieldBlur: uiFeedback.onFieldBlur,
    onImageError(event) {
      uiFeedback.onImageError.call(this,event);
    },
    // ---------- shell ----------
    resetFormEdits() {
      this._formEdits={};
    },
    markFormEdit(field) { (this._formEdits||(this._formEdits={}))[field]=true; },
    close() {
      this.resetFormEdits();
      this._personalizing = false;
      this.setData({focusedField:'',sheetScrollTarget:''});
      this.triggerEvent('close');
    },
    onProfileClose(event) {
      const detail=event&&event.detail;
      if(detail&&detail.reason==='identity')this.triggerEvent('close',detail);
      else this.close();
    },
    onProfileNativeAvatar(event) {
      const detail=event&&event.detail||{};
      if(detail.phase==='start'&&detail.userId)this._avatarNativeOwner={userId:detail.userId,request:detail.request};
      else if(detail.phase==='end'&&this._avatarNativeOwner&&detail.request===this._avatarNativeOwner.request)this._avatarNativeOwner=null;
      this.triggerEvent('nativeavatar',detail);
    },
    onProfileScrollTarget(event) {
      const id=event&&event.detail&&event.detail.id||'';
      this.setData({sheetScrollTarget:''},()=>this.setData({sheetScrollTarget:id}));
    },
    noop() { /* absorb taps inside the panel */ },

    goTab(event) {
      const url = event.currentTarget.dataset.url;
      this.close();
      wx.switchTab({ url: url });
    },

    refresh() {
      const type = this.data.type;
      this.setData({today:localDate.today()});
      const titles = SHEET_TITLES[type] || ['', ''];
      const patch = { title: i18n.t(titles[0]), subtitle: i18n.t(titles[1]), copy: i18n.copy(), locale: i18n.locale() };
      let state;
      try {
        state = store.get();
      } catch (error) {
        state = { memories: data.initialMemories.slice(), profile: data.defaultProfile, settings: data.defaultSettings, feedback: [] };
      }
      // Only these leaves are referenced by the template; business methods keep using Store.
      patch.state = {profile:{avatar:state.profile.avatar},settings:{loveSent:state.settings.loveSent,notificationsRead:state.settings.notificationsRead}};
      if(type==='sync') patch.syncRows=(state.outbox||[]).map(op=>({id:op.id,recordId:op.recordId,restaurant:op.base&&op.base.restaurant||op.recordId,kind:i18n.t(op.kind==='delete'?'Delete':op.kind==='update'?'Update':'Flags'),status:i18n.t(op.error==='CONFLICT'?'Conflict':store.canResolve(op.error)?'Needs review':'Pending'),message:i18n.t(op.message||''),conflict:store.canResolve(op.error)}));
      patch.dusk = state.settings.theme === 'dusk';
      patch.quiet = !!state.settings.reduceMotion;

      if (type === 'personalize') this.refreshPersonalization(patch, state);
      else this._personalizing = false;
      if (type === 'memory') this.refreshMemory(patch, state);
      if (type === 'library') this.refreshLibrary(patch, state);
      if (type === 'together') this.refreshTogether(patch, state);
      if (type === 'preferences') this.refreshPreferences(patch, state);
      if (type === 'settings' || type === 'privacy') this.refreshSettings(patch, state);
      if (type === 'weekly') this.refreshWeekly(patch, state);
      if (type === 'journey') this.refreshJourney(patch, state);
      if (type === 'notifications') this.refreshNotifications(patch, state);
      if (type === 'help') this.refreshHelp(patch, state);
      this.setData(patch, () => this.measureScroll());
    },

    measureScroll() {
      if (!this.data.show || this._detached || !this.createSelectorQuery) return;
      const run = () => {
        if (!this.data.show || this._detached) return;
        this.createSelectorQuery().select('.sheet-panel').boundingClientRect()
          .select('.sheet-heading').boundingClientRect().exec(rects => {
            if (!this.data.show || this._detached || !rects || !rects[0] || !rects[1]) return;
            const bottomPadding = 45 * metrics.getMetrics().screenWidth / 750;
            const height = Math.max(0, Math.floor(rects[0].bottom - rects[1].bottom - bottomPadding - 2));
            if (height !== this.data.sheetScrollHeight) this.setData({ sheetScrollHeight: height });
          });
      };
      if (wx.nextTick) wx.nextTick(run); else run();
    },

    refreshPersonalization(patch, state) {
      // Store/cloud refresh must not overwrite text being edited.
      if (this._personalizing) return;
      this._personalizing = true;
      const custom = headings.normalize(state.settings.pageHeadings);
      patch.personalizationRows = headings.pages.map(page => ({
        id: page, label: i18n.t(page.charAt(0).toUpperCase()+page.slice(1)),
        title: custom[page].title, subtitle: custom[page].subtitle, brand: custom[page].brand || '',
        titleDefault: i18n.t(headings.defaults[page].title), subtitleDefault: i18n.t(headings.defaults[page].subtitle),
        brandDefault: page === 'home' ? i18n.t(headings.defaults.home.brand) : '', maxTitle: 24,
      })).concat([{ id: 'me', label: i18n.t('Me'), title: state.profile.name, subtitle: state.profile.bio,
        titleDefault: data.defaultProfile.name, subtitleDefault: data.defaultProfile.bio, maxTitle: 32 }]);
      patch.personalizationError = ''; patch.personalizationNameError='';
    },
    onPersonalizationInput(event) {
      const index = Number(event.currentTarget.dataset.index), field = event.currentTarget.dataset.field;
      if (!this.data.personalizationRows[index] || ['title','subtitle','brand'].indexOf(field) < 0) return;
      const rows = this.data.personalizationRows.map(row => Object.assign({}, row));
      rows[index][field] = event.detail.value;
      this.setData({ personalizationRows: rows, personalizationError: '' });
    },
    onPersonalizationReset(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!this.data.personalizationRows[index]) return;
      const rows = this.data.personalizationRows.map(row => Object.assign({}, row));
      const row = rows[index];
      row.title = row.id === 'me' ? data.defaultProfile.name : '';
      row.subtitle = row.id === 'me' ? data.defaultProfile.bio : '';
      row.brand = '';
      this.setData({ personalizationRows: rows, personalizationError: '' });
    },
    onPersonalizationSave() {
      const rows = this.data.personalizationRows, me = rows.find(row => row.id === 'me');
      if (!me || !headings.clean(me.title, 32)) {
        this.setData({ personalizationError: i18n.t('Your name cannot be empty.'), personalizationNameError: i18n.t('Your name cannot be empty.'), sheetScrollTarget:'' },()=>this.setData({sheetScrollTarget:'personalize-field-'+Math.max(0,rows.indexOf(me))})); return;
      }
      const custom = {};
      rows.forEach(row => { if (row.id !== 'me') custom[row.id] = { title: row.title, subtitle: row.subtitle, brand: row.brand }; });
      try { store.updatePersonalization(custom, { name: me.title, bio: me.subtitle }); }
      catch (error) { this.setData({ personalizationNameError:'', personalizationError: i18n.t('Could not save. Free some storage and try again.') }); return; }
      this.close();
      store.notify(i18n.t('Personalization saved.'));
    },

    onSyncRetry() { return store.syncCloud().catch(e=>store.notify(e.message)); },
    onUseCloud(event) {
      i18n.modal({title:'Use cloud version',content:'Discard local pending changes for this record and use the cloud version?',success:r=>{if(r.confirm) store.useCloudVersion(event.currentTarget.dataset.id).catch(e=>store.notify(i18n.t(e.message)));}});
    },
    onEditMemory() {
      const memory=this.data.detail && this.data.detail.memory; if(!memory) return;
      const token=identity.lease();
      const start=()=>{try{identity.assertLease(token);store.beginEdit(memory);this.close();wx.switchTab({url:'/pages/add/index'});}catch(e){store.notify(i18n.t(e.message));}};
      const draft=store.loadDraft();
      if(draft.restaurant || draft.photos.length) i18n.modal({title:'Edit memory',content:'Replace the existing Add draft?',success:r=>{if(r.confirm) start();}}); else start();
    },
    onSheetScroll(event) {
      // Read position only; no setData per scroll frame and no parent gallery reset.
      if (this.data.type === 'memory') this._readingScrollTop = event.detail.scrollTop;
    },
    onDetailPreview() {
      const detail = this.data.detail;
      if (!detail || !detail.images.length) return;
      this.triggerEvent('nativepreview', {
        memoryId: this.data.memoryId, images: detail.images,
        photoIndex: this.data.photoIndex || 0, scrollTop: this._readingScrollTop || 0,
      });
    },

    // ---------- memory detail ----------
    refreshMemory(patch, state) {
      const memory = state_find(state ? state.memories : [], this.data.memoryId);
      patch.confirmDelete = false;
      patch.photoIndex = this.data.photoIndex || 0;
      patch.detail = memory ? {
        memory: memory,
        dateLabel: data.formatDate(memory.date),
        location: require('../../utils/locations').display(memory),
        images: [memory.photo].concat(memory.extraPhotos || []),
        notes: memory.notes || i18n.t('Some moments need no words.'),
        showLocations: state ? state.settings.showLocations : true,
      } : null;
      if (patch.detail && patch.photoIndex >= patch.detail.images.length) patch.photoIndex = 0;
    },

    onPhotoSelect(event) {
      this.setData({ photoIndex: Number(event.currentTarget.dataset.index) });
    },
    onLove() {
      const memory = this.data.detail && this.data.detail.memory;
      if (!memory) return;
      store.updateMemory(memory.id, { liked: !memory.liked });
    },
    onSave() {
      const memory = this.data.detail && this.data.detail.memory;
      if (!memory) return;
      store.updateMemory(memory.id, { saved: !memory.saved });
    },
    onShare() {
      const memory = this.data.detail && this.data.detail.memory;
      if (!memory) return;
      store.updateMemory(memory.id, { shared: !memory.shared });
      store.notify(memory.shared ? i18n.t('Removed from your Us collection; shared-space access is unchanged.') : i18n.t('Added to your Us collection; not sent to another account.'));
    },
    onDeleteAsk() {
      this.setData({ confirmDelete: true });
    },
    onDeleteKeep() {
      this.setData({ confirmDelete: false });
    },
    onDeleteConfirm() {
      const memory = this.data.detail && this.data.detail.memory;
      if (!memory) return;
      try {store.deleteMemory(memory.id);} catch(e) {store.notify(i18n.t('Could not save. Free some storage and try again.'));return;}
      photos.pruneOrphans(photos.collectReferenced(store.get()));
      this.close();
      store.notify(i18n.t('Memory removed from your diary.'));
    },

    // ---------- library ----------
    refreshLibrary(patch, state) {
      const initialFilter = this.data.filter || 'all';
      if (initialFilter !== this.data.libraryTab && !this._libraryTouched) this.setData({ libraryTab: initialFilter });
      const filter = this._libraryTouched ? this.data.libraryTab : initialFilter;
      patch.libraryTab = filter;
      const query = (this.data.libraryQuery || '').toLowerCase();
      const filtered = state.memories.filter(function (memory) {
        const matchFilter = filter === 'all' || (filter === 'shared' && memory.shared) || (filter === 'favorites' && (memory.saved || memory.liked));
        const haystack = (memory.restaurant + ' ' + memory.city + ' ' + memory.tags.join(' ')).toLowerCase();
        return matchFilter && haystack.indexOf(query) >= 0;
      });
      patch.libraryRows = withRows(filtered);
    },
    onLibraryTab(event) {
      this._libraryTouched = true;
      this.setData({ libraryTab: event.currentTarget.dataset.value }, function () { this.refresh(); }.bind(this));
    },
    onLibraryQuery(event) {
      this._libraryTouched = true;
      this.setData({ libraryQuery: event.detail.value }, function () { this.refresh(); }.bind(this));
    },
    onLibraryOpen(event) {
      const id = event.detail.id;
      this.triggerEvent('sheetchange', { type: 'memory', memoryId: id, filter: '' });
    },
    onExport() {
      const token=identity.lease();
      const state = store.get();
      const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: state.memories }, null, 2);
      const path = wx.env.USER_DATA_PATH + '/savor-memories-' + token.userId + '-' + Date.now() + '.json';
      try {
        wx.getFileSystemManager().writeFileSync(path, payload, 'utf8');
      } catch (error) {
        this.setData({ libraryError: i18n.t('Could not write the backup file on this device.') });
        return;
      }
      store.notify(i18n.t('Your memories, ready to take with you. Backup saved.'));
      if (wx.shareFileMessage) {
        wx.shareFileMessage({
          filePath: path,
          success: function () { /* sheet stays open */ },
          fail: function () {
            if(!identity.isCurrent(token))return;
            wx.setClipboardData({ data: payload });
            store.notify(i18n.t('Sharing unavailable — backup JSON copied to clipboard instead.'));
          },
        });
      } else {
        wx.setClipboardData({ data: payload });
        store.notify(i18n.t('Backup JSON copied to clipboard.'));
      }
    },
    onImport() {
      let token=identity.lease();
      const that = this;
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: async function (result) {
          try{token=await identity.resumeNative(token);}catch(e){return;}
          const file = result.tempFiles && result.tempFiles[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            that.setData({ libraryError: i18n.t('Please use a backup smaller than 10 MB.') });
            return;
          }
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: 'utf8',
            success: function (read) {
              if(!identity.isCurrent(token))return;
              that.applyImport(String(read.data));
            },
            fail: function () {
              that.setData({ libraryError: i18n.t('This file could not be read. Choose a Savor JSON backup.') });
            },
          });
        },
        fail: function () { /* user cancelled */ },
      });
    },
    applyImport(text) {
      try {
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : parsed.memories;
        if (!Array.isArray(items) || items.length > 500 || !items.every(data.isMemory)) {
          throw new Error('not-valid');
        }
        const count = store.importMemories(items);
        store.notify(count ? i18n.t('{count} memories welcomed back to your diary.', { count }) : i18n.t('Your diary already has every memory in this backup.'));
        this.setData({ libraryError: '' });
        this.refresh();
      } catch (error) {
        this.setData({ libraryError: error.message === 'not-valid'
          ? i18n.t('This is not a valid Savor backup. Choose a JSON file exported from Savor.')
          : i18n.t('This file could not be read. Choose a Savor JSON backup.') });
      }
    },

    // ---------- together ----------
    refreshTogether(patch, state) {
      if(!(this._formEdits||{}).partner)patch.partner = state.profile.partner;
      if(!(this._formEdits||{}).since)patch.since = state.profile.togetherSince;
    },
    onPartnerInput(event) { this.markFormEdit('partner');this.setData({ partner: event.detail.value }); },
    onSinceChange(event) { this.markFormEdit('since');this.setData({ since: event.detail.value }); },
    onLoveTap() {
      const settings = store.get().settings;
      store.updateSettings({ loveSent: !settings.loveSent });
      if (!settings.loveSent) store.notify(i18n.t('A little love, added to your shared space.'));
    },
    onTogetherSave() {
      const partner = this.data.partner.trim();
      const since = this.data.since;
      if (!partner || !since) return;
      store.updateProfile({ partner: partner, togetherSince: since });
      store.notify(i18n.t('Your shared story is updated.'));
      this.close();
    },

    // ---------- preferences ----------
    refreshPreferences(patch, state) {
      patch.dietary = state.settings.dietary;
      patch.dietaryOptions = DIETARY_OPTIONS.map(value => i18n.t(value));
      patch.dietaryLabel = i18n.t(state.settings.dietary);
      patch.cuisineOptions = CUISINE_OPTIONS.map(value => ({ value, label: i18n.t(value) }));
      patch.dietaryIndex = Math.max(0, DIETARY_OPTIONS.indexOf(state.settings.dietary));
      patch.cuisines = state.settings.cuisines.slice();
    },
    onDietaryChange(event) {
      const index = Number(event.detail.value);
      this.setData({ dietaryIndex: index, dietary: DIETARY_OPTIONS[index], dietaryLabel: i18n.t(DIETARY_OPTIONS[index]) });
    },
    onCuisineTap(event) {
      const cuisine = event.currentTarget.dataset.value;
      const cuisines = this.data.cuisines.slice();
      const index = cuisines.indexOf(cuisine);
      if (index >= 0) cuisines.splice(index, 1);
      else cuisines.push(cuisine);
      this.setData({ cuisines: cuisines });
    },
    onPreferencesSave() {
      store.updateSettings({ dietary: this.data.dietary, cuisines: this.data.cuisines });
      store.notify(i18n.t('Your tastes, remembered. Preferences saved.'));
      this.close();
    },

    // ---------- settings / privacy ----------
    refreshSettings(patch, state) {
      patch.languageOptions = i18n.options();
      patch.languageIndex = Math.max(0, patch.languageOptions.findIndex(option => option.value === state.settings.language));
      patch.theme = state.settings.theme;
      patch.reminders = state.settings.reminders;
      patch.reduceMotion = state.settings.reduceMotion;
      patch.privateByDefault = state.settings.privateByDefault;
      patch.showLocations = state.settings.showLocations;
    },
    onLanguageChange(event) {
      const option = i18n.options()[Number(event.detail.value)];
      if (option) store.updateSettings({ language: option.value });
    },
    onThemeTap(event) {
      store.updateSettings({ theme: event.currentTarget.dataset.value });
      this.setData({ dusk: event.currentTarget.dataset.value === 'dusk' });
    },
    onRemindersToggle() { store.updateSettings({ reminders: !this.data.reminders }); },
    onQuietToggle() { store.updateSettings({ reduceMotion: !this.data.reduceMotion }); },
    onPrivateToggle() { store.updateSettings({ privateByDefault: !this.data.privateByDefault }); },
    onLocationsToggle() { store.updateSettings({ showLocations: !this.data.showLocations }); },
    onManageMemories() {
      this.triggerEvent('sheetchange', { type: 'library', memoryId: '', filter: 'all' });
    },

    // ---------- weekly ----------
    refreshWeekly(patch, state) {
      const result=stats.summary(state.memories);
      patch.weeklyStats={meals:result.weeklyMeals,places:result.weeklyPlaces};
      const max=Math.max(1,...result.counts);
      patch.weeklyBars=result.counts.map((count,index)=>({count,height:count/max*100,letter:i18n.locale()==='zh-CN'?['一','二','三','四','五','六','日'][index]:WEEK_LETTERS[index],highlight:result.dates[index]===localDate.today()}));
      patch.weeklyRows=withRows(result.weekly);
    },
    onWeeklyAdd() { this.goTab({ currentTarget: { dataset: { url: '/pages/add/index' } } }); },

    // ---------- journey ----------
    refreshJourney(patch, state) {
      patch.journeyStops=stats.real(state.memories,true).map((memory,index)=>({title:require('../../utils/locations').display(memory),date:data.formatDate(memory.date),text:memory.restaurant,fresh:index===0}));
    },
    onJourneyMap() { this.goTab({ currentTarget: { dataset: { url: '/pages/map/index' } } }); },

    // ---------- notifications ----------
    refreshNotifications(patch, state) {
      patch.notifRows = [];
      if (state.settings.notificationsRead) return;
      const memory = state_find(state.memories, 'comptoir') || state.memories[0];
      if (memory) {
        patch.notifRows.push({
          kind: 'memory',
          memoryId: memory.id,
          photoSrc: memory.photo,
          title: i18n.t('A moment with {partner}', { partner: state.profile.partner }),
          text: i18n.t('Remember that dinner at {restaurant}?', { restaurant: memory.restaurant }),
          when: i18n.t('A little while ago'),
        });
      }
      patch.notifRows.push({
        kind: 'weekly',
        photoSrc: '',
        title: i18n.t('Your week, beautifully kept'),
        text: i18n.t('Take a little look at your latest memories.'),
        when: i18n.t('Your weekly reflection'),
      });
    },
    onNotificationRow(event) {
      const kind = event.currentTarget.dataset.kind;
      store.updateSettings({ notificationsRead: true });
      if (kind === 'memory') {
        this.triggerEvent('sheetchange', { type: 'memory', memoryId: event.currentTarget.dataset.id, filter: '' });
      } else {
        this.triggerEvent('sheetchange', { type: 'weekly', memoryId: '', filter: '' });
      }
    },
    onMarkRead() {
      store.updateSettings({ notificationsRead: true });
      this.close();
    },

    // ---------- help ----------
    refreshHelp(patch, state) {
      patch.faqs = FAQS.map(faq => ({ question: i18n.t(faq.question), answer: i18n.t(faq.answer) }));
      patch.feedbackMessage = '';
      patch.feedbackCountLabel = i18n.t('You have saved {count} feedback notes on this device.', { count: state.feedback.length });
      patch.faqExpanded = Number.isInteger(this.data.faqExpanded) ? this.data.faqExpanded : -1;
    },
    onFaqTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const next=this.data.faqExpanded === index ? -1 : index;
      this._faqRequest=(this._faqRequest||0)+1;
      const request=this._faqRequest;
      if(next<0||!this.createSelectorQuery){this.setData({faqExpanded:next});return;}
      this.createSelectorQuery().selectAll('.faq-answer-text').boundingClientRect(rects=>{
        if(this._detached||!this.data.show||request!==this._faqRequest)return;
        this.setData({faqHeights:(rects||[]).map(r=>r.height),faqExpanded:next});
      }).exec();
    },
    onCloudFeedback(){this.close();wx.navigateTo({url:'/pages/workspace/index'});},
    onFeedbackInput(event) { this.setData({ feedbackMessage: event.detail.value }); },
    onFeedbackSave() {
      const message = this.data.feedbackMessage.trim();
      if (!message) return;
      store.saveFeedback(message);
      const count = store.get().feedback.length;
      store.notify(i18n.t('Thank you. Your feedback note is saved on this device.') + ' ' + i18n.t('You have saved {count} feedback notes on this device.', { count }));
      this.close();
    },
  },
});

function state_find(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return undefined;
}
