const i18n = require('../../utils/i18n');
const store = require('../../utils/store');

const DIETARY_OPTIONS = ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'];
const CUISINE_OPTIONS = ['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'];

Component({
  properties: {
    active: { type: Boolean, value: false },
    show: { type: Boolean, value: false },
    type: { type: String, value: '' },
    dusk: { type: Boolean, value: false },
  },
  data: {
    copy: i18n.copy(),
    dietary: 'No restrictions', dietaryOptions: [], dietaryIndex: 0, dietaryLabel: '',
    cuisines: [], cuisineOptions: [], languageOptions: [], languageIndex: 0,
    theme: 'pearl', reminders: true, reduceMotion: false,
    privateByDefault: false, showLocations: true,
  },
  observers: {
    'active, show, type': function (active, show, type) {
      const view = active && show ? type : '';
      if (view === this._view) return;
      this._view = view;
      this._editingPreferences = false;
      if (view) this.refresh();
    },
  },
  lifetimes: {
    attached() {
      this.unsubscribe = store.subscribe(() => {
        if (!this._view || (this._view === 'preferences' && this._editingPreferences)) return;
        this.refresh();
      });
      if (this.data.active && this.data.show) { this._view = this.data.type; this.refresh(); }
    },
    detached() { if (this.unsubscribe) this.unsubscribe(); },
  },
  methods: {
    refresh() {
      const settings = store.get().settings;
      const languageOptions = i18n.options();
      const patch = {
        copy: i18n.copy(), languageOptions,
        languageIndex: Math.max(0, languageOptions.findIndex(option => option.value === settings.language)),
        theme: settings.theme, reminders: settings.reminders, reduceMotion: settings.reduceMotion,
        privateByDefault: settings.privateByDefault, showLocations: settings.showLocations,
      };
      if (this._view === 'preferences' && !this._editingPreferences) Object.assign(patch, {
        dietary: settings.dietary,
        dietaryOptions: DIETARY_OPTIONS.map(value => i18n.t(value)),
        dietaryLabel: i18n.t(settings.dietary),
        dietaryIndex: Math.max(0, DIETARY_OPTIONS.indexOf(settings.dietary)),
        cuisines: settings.cuisines.slice(),
        cuisineOptions: CUISINE_OPTIONS.map(value => ({ value, label: i18n.t(value) })),
      });
      this.setData(patch);
    },
    onDietaryChange(event) {
      const index = Number(event.detail.value);
      this._editingPreferences = true;
      this.setData({ dietaryIndex: index, dietary: DIETARY_OPTIONS[index], dietaryLabel: i18n.t(DIETARY_OPTIONS[index]) });
    },
    onCuisineTap(event) {
      const cuisine = event.currentTarget.dataset.value;
      const cuisines = this.data.cuisines.slice();
      const index = cuisines.indexOf(cuisine);
      this._editingPreferences = true;
      if (index >= 0) cuisines.splice(index, 1); else cuisines.push(cuisine);
      this.setData({ cuisines });
    },
    onPreferencesSave() {
      store.updateSettings({ dietary: this.data.dietary, cuisines: this.data.cuisines });
      store.notify(i18n.t('Your tastes, remembered. Preferences saved.'));
      this.triggerEvent('close');
    },
    onLanguageChange(event) {
      const option = i18n.options()[Number(event.detail.value)];
      if (option) store.updateSettings({ language: option.value });
    },
    onThemeTap(event) { store.updateSettings({ theme: event.currentTarget.dataset.value }); },
    onRemindersToggle() { store.updateSettings({ reminders: !this.data.reminders }); },
    onQuietToggle() { store.updateSettings({ reduceMotion: !this.data.reduceMotion }); },
    onPrivateToggle() { store.updateSettings({ privateByDefault: !this.data.privateByDefault }); },
    onLocationsToggle() { store.updateSettings({ showLocations: !this.data.showLocations }); },
    onManageMemories() { this.triggerEvent('sheetchange', { type: 'library', memoryId: '', filter: 'all' }); },
  },
});
