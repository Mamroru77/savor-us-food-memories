const spaceCopy = require('../../utils/spaceCopy');
const localDate = require('../../utils/localDate');
const data = require('../../utils/data');

function formatDisplayDate(value, isZh) {
  if (!data.isValidDate(value)) return data.formatDate(value);
  const parts = value.split('-').map(Number);
  if (isZh) return `${parts[0]}年${parts[1]}月${parts[2]}日`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
}

Component({
  properties: {
    space: { type: null, value: null },
    busy: { type: Boolean, value: false },
    pending: { type: Boolean, value: false },
    dusk: { type: Boolean, value: false },
    locale: { type: String, value: '' },
  },

  data: {
    labels: {},
    today: '',
    savedDate: '',
    draftDate: '',
    daysSummary: '',
  },

  observers: {
    'space, locale': function () {
      this.sync();
    },
  },

  lifetimes: {
    attached() {
      this.sync();
    },
  },

  methods: {
    sync() {
      const space = this.data.space;
      const isZh = this.data.locale === 'zh-CN';
      const today = localDate.today();
      const labels = spaceCopy();
      const nextId = space && space.id ? space.id : '';
      const nextSaved = space && space.togetherSince ? space.togetherSince : '';
      const shouldReset = nextId !== (this._lastSpaceId || '')
        || nextSaved !== (this._lastSavedDate || '')
        || !this.data.draftDate;
      this._lastSpaceId = nextId;
      this._lastSavedDate = nextSaved;
      const draftDate = shouldReset ? nextSaved : this.data.draftDate;
      let daysSummary = '';
      if (nextSaved) {
        const days = localDate.daysInclusive(nextSaved);
        const formatted = formatDisplayDate(nextSaved, isZh);
        daysSummary = isZh
          ? `已经相伴 ${days} 天（始于 ${formatted}）`
          : `Together for ${days} ${days === 1 ? 'day' : 'days'} (since ${formatted})`;
      }
      this.setData({ labels, today, savedDate: nextSaved, draftDate, daysSummary });
    },

    onDateChange(event) {
      const value = event && event.detail && event.detail.value;
      if (value) this.setData({ draftDate: value });
    },

    onSaveTap() {
      if (this.data.busy || this.data.pending) return;
      const date = this.data.draftDate;
      if (!date || date === this.data.savedDate) return;
      this.triggerEvent('save', { date });
    },
  },
});
