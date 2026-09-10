// s-sheet — full port of the web Sheets.tsx: bottom sheet shell plus all
// eleven sheet contents (memory detail, library, profile, together,
// preferences, settings, privacy, weekly, journey, notifications, help).
const store = require('../../utils/store');
const data = require('../../utils/data');
const photos = require('../../utils/photos');

const DIETARY_OPTIONS = ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'];
const CUISINE_OPTIONS = ['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'];
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_BARS = [28, 54, 38, 74, 100, 65, 44];

const FAQS = [
  { question: 'Where are my memories saved?', answer: 'Right here on this device. Savor works without an account. Use Export backup in Memories to keep a copy before clearing app data or moving to another device.' },
  { question: 'How do I share a moment?', answer: 'Open a memory and tap Share with us. It appears in the Us screen in this diary. This concept does not send data to another device or person.' },
  { question: 'Can I add my own photos?', answer: 'Of course. Tap Add, then the photo area or Add more. You can keep up to four photos in each memory.' },
];

const SHEET_TITLES = {
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
      location: (memory.neighborhood ? memory.neighborhood + ', ' : '') + memory.city,
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
  },

  data: {
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
    // profile form
    profileName: '',
    profileBio: '',
    profileAvatar: '',
    profileUploading: false,
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
    faqs: FAQS,
    faqExpanded: -1,
    feedbackMessage: '',
  },

  observers: {
    'show, type, memoryId, filter': function () {
      if (this.data.show) this.refresh();
    },
  },

  lifetimes: {
    attached() {
      this.unsubscribe = store.subscribe(function () {
        if (this.data.show) this.refresh();
      }.bind(this));
      try {
        const state = store.get();
        this.setData({ dusk: state.settings.theme === 'dusk', today: new Date().toISOString().slice(0, 10) });
      } catch (error) { /* fall back to light theme */ }
    },
    detached() {
      if (this.unsubscribe) this.unsubscribe();
    },
  },

  methods: {
    // ---------- shell ----------
    close() {
      this.triggerEvent('close');
    },
    noop() { /* absorb taps inside the panel */ },

    goTab(event) {
      const url = event.currentTarget.dataset.url;
      this.close();
      wx.switchTab({ url: url });
    },

    refresh() {
      const type = this.data.type;
      const titles = SHEET_TITLES[type] || ['', ''];
      const patch = { title: titles[0], subtitle: titles[1] };
      let state;
      try {
        state = store.get();
      } catch (error) {
        state = { memories: data.initialMemories.slice(), profile: data.defaultProfile, settings: data.defaultSettings, feedback: [] };
      }
      patch.state = state;
      patch.dusk = state.settings.theme === 'dusk';

      if (type === 'memory') this.refreshMemory(patch, state);
      if (type === 'library') this.refreshLibrary(patch);
      if (type === 'profile') this.refreshProfile(patch, state);
      if (type === 'together') this.refreshTogether(patch, state);
      if (type === 'preferences') this.refreshPreferences(patch, state);
      if (type === 'settings' || type === 'privacy') this.refreshSettings(patch, state);
      if (type === 'weekly') this.refreshWeekly(patch, state);
      if (type === 'journey') this.refreshJourney(patch, state);
      if (type === 'notifications') this.refreshNotifications(patch, state);
      if (type === 'help') this.refreshHelp(patch, state);
      this.setData(patch);
    },

    // ---------- memory detail ----------
    refreshMemory(patch, state) {
      const memory = state_find(state ? state.memories : [], this.data.memoryId);
      patch.confirmDelete = false;
      patch.photoIndex = this.data.photoIndex || 0;
      patch.detail = memory ? {
        memory: memory,
        dateLabel: data.formatDate(memory.date),
        location: memory.city + ', ' + memory.country,
        images: [memory.photo].concat(memory.extraPhotos || []),
        notes: memory.notes || 'Some moments need no words.',
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
      store.notify(memory.shared ? 'This moment is now just for you.' : 'A new chapter in your shared story.');
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
      store.deleteMemory(memory.id);
      photos.pruneOrphans(photos.collectReferenced(store.get()));
      this.close();
      store.notify('Memory removed from your diary.');
    },

    // ---------- library ----------
    refreshLibrary(patch) {
      const state = this.data.state;
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
      const state = store.get();
      const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: state.memories }, null, 2);
      const path = wx.env.USER_DATA_PATH + '/savor-memories-' + new Date().toISOString().slice(0, 10) + '.json';
      try {
        wx.getFileSystemManager().writeFileSync(path, payload, 'utf8');
      } catch (error) {
        this.setData({ libraryError: 'Could not write the backup file on this device.' });
        return;
      }
      store.notify('Your memories, ready to take with you. Backup saved.');
      if (wx.shareFileMessage) {
        wx.shareFileMessage({
          filePath: path,
          success: function () { /* sheet stays open */ },
          fail: function () {
            wx.setClipboardData({ data: payload });
            store.notify('Sharing unavailable — backup JSON copied to clipboard instead.');
          },
        });
      } else {
        wx.setClipboardData({ data: payload });
        store.notify('Backup JSON copied to clipboard.');
      }
    },
    onImport() {
      const that = this;
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: function (result) {
          const file = result.tempFiles && result.tempFiles[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            that.setData({ libraryError: 'Please use a backup smaller than 10 MB.' });
            return;
          }
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: 'utf8',
            success: function (read) {
              that.applyImport(String(read.data));
            },
            fail: function () {
              that.setData({ libraryError: 'This file could not be read. Choose a Savor JSON backup.' });
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
        store.notify(count ? count + (count === 1 ? ' memory welcomed back to your diary.' : ' memories welcomed back to your diary.') : 'Your diary already has every memory in this backup.');
        this.setData({ libraryError: '' });
        this.refresh();
      } catch (error) {
        this.setData({ libraryError: error.message === 'not-valid'
          ? 'This is not a valid Savor backup. Choose a JSON file exported from Savor.'
          : 'This file could not be read. Choose a Savor JSON backup.' });
      }
    },

    // ---------- profile ----------
    refreshProfile(patch, state) {
      patch.profileName = state.profile.name;
      patch.profileBio = state.profile.bio;
      patch.profileAvatar = state.profile.avatar;
      patch.profileUploading = false;
    },
    onProfileName(event) { this.setData({ profileName: event.detail.value }); },
    onProfileBio(event) { this.setData({ profileBio: event.detail.value }); },
    onAvatarChange() {
      const that = this;
      photos.choosePhotos(1).then(function (paths) {
        if (paths.length) that.setData({ profileAvatar: paths[0], profileUploading: false });
      }).catch(function () { /* cancelled */ });
    },
    onProfileSave() {
      const name = this.data.profileName.trim();
      if (!name) return;
      store.updateProfile({ name: name, bio: this.data.profileBio.trim(), avatar: this.data.profileAvatar });
      photos.pruneOrphans(photos.collectReferenced(store.get()));
      store.notify('A little more you. Profile updated.');
      this.close();
    },

    // ---------- together ----------
    refreshTogether(patch, state) {
      patch.partner = state.profile.partner;
      patch.since = state.profile.togetherSince;
    },
    onPartnerInput(event) { this.setData({ partner: event.detail.value }); },
    onSinceChange(event) { this.setData({ since: event.detail.value }); },
    onLoveTap() {
      const settings = store.get().settings;
      store.updateSettings({ loveSent: !settings.loveSent });
      if (!settings.loveSent) store.notify('A little love, added to your shared space.');
    },
    onTogetherSave() {
      const partner = this.data.partner.trim();
      const since = this.data.since;
      if (!partner || !since) return;
      store.updateProfile({ partner: partner, togetherSince: since });
      store.notify('Your shared story is updated.');
      this.close();
    },

    // ---------- preferences ----------
    refreshPreferences(patch, state) {
      patch.dietary = state.settings.dietary;
      patch.dietaryIndex = Math.max(0, DIETARY_OPTIONS.indexOf(state.settings.dietary));
      patch.cuisines = state.settings.cuisines.slice();
    },
    onDietaryChange(event) {
      const index = Number(event.detail.value);
      this.setData({ dietaryIndex: index, dietary: DIETARY_OPTIONS[index] });
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
      store.notify('Your tastes, remembered. Preferences saved.');
      this.close();
    },

    // ---------- settings / privacy ----------
    refreshSettings(patch, state) {
      patch.theme = state.settings.theme;
      patch.reminders = state.settings.reminders;
      patch.reduceMotion = state.settings.reduceMotion;
      patch.privateByDefault = state.settings.privateByDefault;
      patch.showLocations = state.settings.showLocations;
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
      const added = state.memories.length - data.initialMemories.length;
      patch.weeklyStats = {
        meals: Math.max(0, 12 + added),
        places: 5 + Math.max(0, added),
      };
      patch.weeklyBars = WEEK_BARS.map(function (height, index) {
        return { height: height, letter: WEEK_LETTERS[index], highlight: index === 4 };
      });
      patch.weeklyRows = withRows(state.memories.slice(0, 3));
    },
    onWeeklyAdd() { this.goTab({ currentTarget: { dataset: { url: '/pages/add/index' } } }); },

    // ---------- journey ----------
    refreshJourney(patch, state) {
      const recent = state.memories.filter(function (memory) { return memory.shared; })[0];
      patch.journeyStops = [
        {
          title: recent ? recent.city + ', ' + recent.country : 'The next adventure',
          date: recent ? data.formatDate(recent.date) : 'Still to be written',
          text: 'Another little chapter in our story.',
          fresh: true,
        },
        { title: 'Kyoto, Japan', date: 'Jul 14, 2025', text: 'Rainy afternoons and the warmest bowls.', fresh: false },
        { title: 'Copenhagen, Denmark', date: 'May 3, 2025', text: 'Long lunches. A new favorite city.', fresh: false },
        { title: 'Our first meal', date: data.formatDate(state.profile.togetherSince), text: 'The start of something worth savoring.', fresh: false },
      ];
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
          title: 'A moment with ' + state.profile.partner,
          text: 'Remember that dinner at ' + memory.restaurant + '?',
          when: 'A little while ago',
        });
      }
      patch.notifRows.push({
        kind: 'weekly',
        photoSrc: '',
        title: 'Your week, beautifully kept',
        text: 'Take a little look at your latest memories.',
        when: 'Your weekly reflection',
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
      patch.feedbackMessage = '';
      patch.faqExpanded = this.data.faqExpanded || -1;
      patch.state = state;
    },
    onFaqTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      this.setData({ faqExpanded: this.data.faqExpanded === index ? -1 : index });
    },
    onFeedbackInput(event) { this.setData({ feedbackMessage: event.detail.value }); },
    onFeedbackSave() {
      const message = this.data.feedbackMessage.trim();
      if (!message) return;
      store.saveFeedback(message);
      const count = store.get().feedback.length;
      store.notify('Thank you. Your feedback note is saved on this device.' + (count > 0 ? ' You have saved ' + count + (count === 1 ? ' note.' : ' notes.') : ''));
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
