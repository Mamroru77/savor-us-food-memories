// One page, nine panels. The `type` query picks profile, together, preferences, settings, privacy, weekly, journey, notifications, or help.
const store = require('../../utils/store');
const image = require('../../utils/image');
const { photos, stats, formatDate, today } = require('../../utils/data');

const TITLES = {
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
const DIETARY = ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'];
const CUISINES = ['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'];
const THEMES = [{ value: 'pearl', label: 'Pearl' }, { value: 'dusk', label: 'Dusk' }];
const BARS = [28, 54, 38, 74, 100, 65, 44].map((height, index) => ({ id: index, height, label: 'MTWTFSS'.charAt(index), highlight: index === 4 }));
const FAQS = [
  { question: 'Where are my memories saved?', answer: 'Right here on this device, inside WeChat storage for this mini program. Use Export backup in Memories to keep a copy before clearing storage or moving phones.' },
  { question: 'How do I share a moment?', answer: 'Open a memory and tap Share with us to add it to the Us screen of this diary. Send to a friend forwards a card to a WeChat chat.' },
  { question: 'Can I add my own photos?', answer: 'Of course. Tap Add, then the photo area or Add more. You can keep up to four photos in each memory.' },
];

Page({
  data: {
    type: 'settings', title: '', subtitle: '', theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', buttonInk: '#ffffff',
    form: {}, error: '', settings: {}, profile: {}, stats: {}, recent: [], timeline: [], noteMemory: null,
    expanded: -1, message: '', feedbackCount: 0, dietaryOptions: DIETARY, dietaryIndex: 0, cuisines: [],
    themes: THEMES, bars: BARS, faqs: FAQS, alexPhoto: photos.alex, today: today(),
  },

  onLoad(query) {
    const type = TITLES[query.type] ? query.type : 'settings';
    const state = store.getState();
    this.setData({
      type, title: TITLES[type][0], subtitle: TITLES[type][1],
      form: this.initialForm(type, state),
      dietaryIndex: Math.max(0, DIETARY.indexOf(state.settings.dietary)),
      cuisines: CUISINES.map((name) => ({ name, selected: state.settings.cuisines.indexOf(name) >= 0 })),
    });
    this.unbind = store.bind(this, (current) => this.select(current));
  },
  onUnload() { if (this.unbind) this.unbind(); },

  initialForm(type, state) {
    if (type === 'profile') return { name: state.profile.name, bio: state.profile.bio, avatar: state.profile.avatar };
    if (type === 'together') return { partner: state.profile.partner, togetherSince: state.profile.togetherSince };
    return {};
  },

  select(state) {
    const shared = state.memories.find((item) => item.shared);
    return Object.assign(store.themeOf(state), {
      settings: state.settings,
      profile: state.profile,
      stats: stats(state),
      recent: state.memories.slice(0, 3),
      feedbackCount: state.feedback.length,
      noteMemory: state.memories.find((item) => item.id === 'comptoir') || state.memories[0] || null,
      timeline: [
        { title: shared ? shared.city + ', ' + shared.country : 'The next adventure', date: shared ? formatDate(shared.date) : 'Still to be written', text: 'Another little chapter in our story.' },
        { title: 'Kyoto, Japan', date: 'Jul 14, 2025', text: 'Rainy afternoons and the warmest bowls.' },
        { title: 'Copenhagen, Denmark', date: 'May 3, 2025', text: 'Long lunches. A new favorite city.' },
        { title: 'Our first meal', date: formatDate(state.profile.togetherSince), text: 'The start of something worth savoring.' },
      ],
    });
  },

  // Profile
  onForm(event) { this.setData({ ['form.' + event.currentTarget.dataset.key]: event.detail.value }); },
  pickAvatar() {
    image.choosePhotos(1).then((paths) => {
      if (!paths.length) return;
      const previous = this.data.form.avatar;
      if (previous !== store.getState().profile.avatar) image.removePhoto(previous);
      this.setData({ 'form.avatar': paths[0], error: '' });
    }).catch((error) => this.setData({ error: error.message }));
  },
  saveProfile() {
    const form = this.data.form;
    if (!form.name.trim()) { this.setData({ error: 'Let us know what to call you.' }); return; }
    const previous = store.getState().profile.avatar;
    store.updateProfile({ name: form.name.trim(), bio: form.bio.trim(), avatar: form.avatar });
    if (previous !== form.avatar) image.removePhoto(previous);
    store.toast('A little more you. Profile updated.');
    wx.navigateBack();
  },

  // Together
  onSince(event) { this.setData({ 'form.togetherSince': event.detail.value }); },
  saveTogether() {
    const form = this.data.form;
    if (!form.partner.trim() || !form.togetherSince) { this.setData({ error: 'Tell us who and when.' }); return; }
    store.updateProfile({ partner: form.partner.trim(), togetherSince: form.togetherSince });
    store.toast('Your shared story is updated.');
    wx.navigateBack();
  },

  // Preferences
  onDietary(event) { this.setData({ dietaryIndex: Number(event.detail.value) }); },
  toggleCuisine(event) {
    const name = event.currentTarget.dataset.name;
    this.setData({ cuisines: this.data.cuisines.map((item) => (item.name === name ? { name, selected: !item.selected } : item)) });
  },
  savePreferences() {
    store.updateSettings({ dietary: DIETARY[this.data.dietaryIndex], cuisines: this.data.cuisines.filter((item) => item.selected).map((item) => item.name) });
    store.toast('Your tastes, remembered.');
    wx.navigateBack();
  },

  // Settings & privacy
  setTheme(event) { store.updateSettings({ theme: event.currentTarget.dataset.value }); },
  toggleSetting(event) {
    const key = event.currentTarget.dataset.key;
    store.updateSettings({ [key]: !store.getState().settings[key] });
  },
  openLibrary() { wx.navigateTo({ url: '/pages/library/index' }); },

  // Help
  toggleFaq(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ expanded: this.data.expanded === index ? -1 : index });
  },
  onMessage(event) { this.setData({ message: event.detail.value }); },
  sendFeedback() {
    const message = this.data.message.trim();
    if (!message) { store.toast('Write a few words first.'); return; }
    store.saveFeedback(message);
    this.setData({ message: '' });
    store.toast('Thank you. Your note is saved on this device.');
  },

  // Weekly, journey, notifications
  goAdd() { wx.switchTab({ url: '/pages/add/index' }); },
  goMap() { wx.switchTab({ url: '/pages/map/index' }); },
  openMemory(event) {
    const id = (event.detail && event.detail.id) || event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(id) });
  },
  openNoteMemory() {
    store.updateSettings({ notificationsRead: true });
    if (this.data.noteMemory) wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(this.data.noteMemory.id) });
  },
  openWeekly() {
    store.updateSettings({ notificationsRead: true });
    wx.redirectTo({ url: '/pages/sheet/index?type=weekly' });
  },
  markRead() {
    if (!this.data.settings.notificationsRead) store.updateSettings({ notificationsRead: true });
    wx.navigateBack();
  },
});
