// Map — native <map> replaces the web's Leaflet. Photo pins become bundled
// pin.png markers; the selected memory shows a callout, and the place card
// (search, filters, bookmark, recenter) mirrors the web interactions.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');

const PARIS_CENTER = { latitude: 48.8535, longitude: 2.3392 };
const DISTANCE_FROM = { latitude: 48.8628, longitude: 2.3349 };
const PIN = '/images/pin.png';

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function visibleMemories(memories, query, filter) {
  const q = (query || '').toLowerCase().trim();
  return memories.filter(function (memory) {
    const haystack = [memory.restaurant, memory.city, memory.country].concat(memory.tags).join(' ').toLowerCase();
    const matchesQuery = haystack.indexOf(q) >= 0;
    const matchesFilter = filter === 'all'
      || (filter === 'favorites' && (memory.saved || memory.liked))
      || (filter === 'shared' && memory.shared);
    return matchesQuery && matchesFilter;
  });
}

Page({
  data: {
    headerTop: 54,
    overlayTop: 174,
    query: '',
    filter: 'all',
    showFilters: false,
    selectedId: 'comptoir',
    dusk: false,
    quiet: false,
    markers: [],
    resultsCount: 0,
    selected: null,
    selectedPhoto: '',
    distanceLabel: '',
    mapError: false,
  },

  onLoad() {
    const m = metrics.getMetrics();
    // Same value the Us screen feeds its padding-top — both headings are
    // positioned from one source, so they always sit at the same height.
    // overlayTop = heading block + search bar + gap, all derived from the
    // same headerTop the Us screen uses — one source, no per-device guessing.
    this.setData({
      headerTop: m.headerTop,
      overlayTop: m.headerTop + 120,
    });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  onShow() {
    const state = store.get();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: 1,
        dusk: state.settings.theme === 'dusk',
        quiet: state.settings.reduceMotion,
      });
    }
    this.mapCtx = wx.createMapContext('savor-map', this);
    this.syncState(state);
  },

  syncState(state) {
    this.allMemories = state.memories;
    this.setData({ dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion });
    this.applyFilters(this.data.query, this.data.filter, this.data.selectedId);
  },

  applyFilters(query, filter, preferredId) {
    const visible = visibleMemories(this.allMemories || [], query, filter);
    const selected = visible.find(function (m) { return m.id === preferredId; })
      || visible.find(function (m) { return m.id === 'comptoir'; })
      || visible[0]
      || null;
    const markers = visible.map(function (memory, index) {
      const isSelected = Boolean(selected && memory.id === selected.id);
      return {
        id: index,
        memoryId: memory.id,
        latitude: memory.coordinates[0],
        longitude: memory.coordinates[1],
        iconPath: PIN,
        width: isSelected ? 52 : 43,
        height: isSelected ? 52 : 43,
        title: memory.restaurant,
        callout: isSelected ? {
          content: memory.restaurant,
          color: '#292d26',
          bgColor: '#ffffff',
          padding: 6,
          borderRadius: 7,
          fontSize: 10,
          display: 'ALWAYS',
        } : undefined,
      };
    });
    this.visibleIds = visible.map(function (m) { return m.id; });
    let distanceLabel = '';
    if (selected) {
      distanceLabel = selected.city === 'Paris'
        ? haversineKm(DISTANCE_FROM, { latitude: selected.coordinates[0], longitude: selected.coordinates[1] }).toFixed(1) + 'km'
        : (selected.neighborhood || 'A little escape');
    }
    this.setData({
      markers: markers,
      resultsCount: query ? visible.length : 0,
      selected: selected,
      selectedPhoto: selected ? (selected.placePhoto || selected.photo || data.photos.meal) : '',
      selectedSaved: Boolean(selected && selected.saved),
      distanceLabel: distanceLabel,
    });
    if ((query.trim() || filter !== 'all') && visible.length && this.mapCtx) {
      const points = visible.map(function (m) { return { latitude: m.coordinates[0], longitude: m.coordinates[1] }; });
      this.mapCtx.includePoints({ points: points, padding: [90, 40, 165, 40] });
    }
  },

  onMarkerTap(event) {
    const memoryId = this.visibleIds && this.visibleIds[event.detail.markerId];
    if (memoryId) {
      this.setData({ selectedId: memoryId });
      this.applyFilters(this.data.query, this.data.filter, memoryId);
    }
  },

  onQuery(event) {
    const query = event.detail.value;
    this.setData({ query: query, showFilters: false });
    this.applyFilters(query, this.data.filter, this.data.selectedId);
  },

  onToggleFilters() {
    this.setData({ showFilters: !this.data.showFilters });
  },

  onFilterPick(event) {
    const value = event.currentTarget.dataset.value;
    this.setData({ filter: value, showFilters: false });
    if (value === 'all' && !this.data.query) this.recenter();
    else this.applyFilters(this.data.query, value, this.data.selectedId);
  },

  recenter() {
    this.setData({ query: '', filter: 'all', selectedId: 'comptoir', showFilters: false });
    this.applyFilters('', 'all', 'comptoir');
    if (this.mapCtx) {
      this.mapCtx.moveToLocation
        ? this.moveToParis()
        : this.moveToParis();
    }
  },

  moveToParis() {
    // moveToLocation needs a location permission; includePoints is enough.
    this.mapCtx.includePoints({
      points: [{ latitude: PARIS_CENTER.latitude, longitude: PARIS_CENTER.longitude }],
      padding: [2, 2, 2, 2],
    });
  },

  onMapError() {
    this.setData({ mapError: true });
  },

  onMapRetry() {
    this.setData({ mapError: false });
  },

  onPlaceOpen() {
    const selected = this.data.selected;
    if (!selected) return;
    this.setData({ sheetShow: true, sheetType: 'memory', sheetMemoryId: selected.id, sheetFilter: '' });
  },

  onBookmark() {
    const selected = this.data.selected;
    if (!selected) return;
    store.updateMemory(selected.id, { saved: !selected.saved });
    store.notify(selected.saved ? 'Place removed from your favorites.' : 'A good place to come back to. Saved.');
  },

  onClearSearch() {
    this.recenter();
  },

  onSheetChange(event) {
    this.setData({
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },

  onSheetClose() {
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
});
