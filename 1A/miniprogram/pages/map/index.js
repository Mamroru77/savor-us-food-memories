// Map First: native <map> with photo pins rendered as always-on custom callouts.
const store = require('../../utils/store');
const { photos, formatDate } = require('../../utils/data');

const PARIS = { latitude: 48.8535, longitude: 2.3392 };
const HOME_POINT = { latitude: 48.8628, longitude: 2.3349 };
const PIN_ICON = '/images/pin.png';
const FILTERS = [
  { value: 'all', label: 'All memories' },
  { value: 'favorites', label: 'Favorites only' },
  { value: 'shared', label: 'Our shared memories' },
];

function distanceKm(a, b) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

Page({
  data: {
    theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752',
    center: PARIS, scale: 14, query: '', filter: 'all', filters: FILTERS, showFilters: false,
    markers: [], visible: 0, selected: null, selectedId: 'comptoir', mapFailed: false,
  },

  onReady() { this.mapContext = wx.createMapContext('memoryMap', this); },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 1 });
    this.release();
    this.unbind = store.bind(this, (state) => {
      this.memories = state.memories;
      return Object.assign(store.themeOf(state), this.compute(state.memories, this.data.query, this.data.filter, this.data.selectedId));
    });
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  compute(memories, query, filter, selectedId) {
    const needle = query.trim().toLowerCase();
    const visible = memories.filter((item) => {
      const text = [item.restaurant, item.city, item.country].concat(item.tags).join(' ').toLowerCase();
      if (needle && text.indexOf(needle) < 0) return false;
      if (filter === 'favorites') return item.saved || item.liked;
      if (filter === 'shared') return item.shared;
      return true;
    });
    const selected = visible.find((item) => item.id === selectedId) || visible.find((item) => item.id === 'comptoir') || visible[0] || null;
    const markers = visible.map((item, index) => ({
      id: index,
      latitude: item.coordinates[0],
      longitude: item.coordinates[1],
      iconPath: PIN_ICON,
      width: 2,
      height: 2,
      alpha: 0,
      anchor: { x: 0.5, y: 0.5 },
      customCallout: { display: 'ALWAYS', anchorX: 0, anchorY: 22 },
      'aria-label': item.restaurant,
      memoryId: item.id,
      photo: item.id === 'comptoir' ? photos.paris : item.photo,
      selected: !!selected && selected.id === item.id,
    }));
    let place = null;
    if (selected) {
      const point = { latitude: selected.coordinates[0], longitude: selected.coordinates[1] };
      place = Object.assign({}, selected, {
        dateLabel: formatDate(selected.date),
        kind: selected.tags.indexOf('Coffee') >= 0 ? 'Cafe' : 'Bistro',
        tag: selected.tags[0] || 'A favorite',
        where: selected.city === 'Paris' ? distanceKm(HOME_POINT, point).toFixed(1) + 'km' : (selected.neighborhood || 'A little escape'),
        cover: selected.placePhoto || selected.photo,
      });
    }
    return { visible: visible.length, markers, selected: place, selectedId: selected ? selected.id : selectedId };
  },

  refresh(extra) {
    const next = Object.assign({ query: this.data.query, filter: this.data.filter, selectedId: this.data.selectedId }, extra);
    const computed = this.compute(this.memories || store.getState().memories, next.query, next.filter, next.selectedId);
    this.setData(Object.assign(next, computed));
    return computed;
  },

  fit(computed) {
    if (!this.mapContext || !computed.markers.length) return;
    const points = computed.markers.map((marker) => ({ latitude: marker.latitude, longitude: marker.longitude }));
    if (points.length === 1) {
      this.mapContext.moveToLocation(points[0]);
      return;
    }
    this.mapContext.includePoints({ points, padding: [90, 40, 190, 40] });
  },

  onQuery(event) { this.fit(this.refresh({ query: event.detail.value, showFilters: false })); },
  clearSearch() { this.recenter(); },
  toggleFilters() { this.setData({ showFilters: !this.data.showFilters }); },
  setFilter(event) {
    const filter = event.currentTarget.dataset.value;
    const computed = this.refresh({ filter, showFilters: false });
    if (filter === 'all' && !this.data.query.trim()) this.recenter();
    else this.fit(computed);
  },
  recenter() {
    this.refresh({ query: '', filter: 'all', selectedId: 'comptoir', showFilters: false });
    if (!this.mapContext) return;
    this.mapContext.includePoints({
      points: [
        { latitude: PARIS.latitude + 0.012, longitude: PARIS.longitude - 0.02 },
        { latitude: PARIS.latitude - 0.012, longitude: PARIS.longitude + 0.02 },
      ],
      padding: [60, 20, 160, 20],
    });
  },
  onPinTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.detail.markerId);
    if (marker) this.refresh({ selectedId: marker.memoryId, showFilters: false });
  },
  onMapTap() { if (this.data.showFilters) this.setData({ showFilters: false }); },
  onMapError(event) {
    console.warn('Map failed to load', event.detail);
    this.setData({ mapFailed: true });
  },
  openPlace() {
    if (this.data.selected) wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(this.data.selected.id) });
  },
  toggleSaved() {
    const selected = this.data.selected;
    if (!selected) return;
    store.updateMemory(selected.id, { saved: !selected.saved });
    store.toast(selected.saved ? 'Removed from your favorites.' : 'Saved. A good place to come back to.');
  },
});
