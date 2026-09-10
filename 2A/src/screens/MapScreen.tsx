import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bookmark, Check, Navigation, Search, SlidersHorizontal, X } from 'lucide-react';
import { formatDate, photos } from '../data';
import type { ScreenProps } from '../data';
import { useSavor } from '../store';
import { IconButton, Photo, ScreenHeading } from '../components/Primitives';

const PARIS_CENTER: L.LatLngExpression = [48.8535, 2.3392];

export function MapScreen({ openSheet }: ScreenProps) {
  const { memories, updateMemory, notify, settings } = useSavor();
  const systemReducedMotion = useReducedMotion();
  const reduceMotion = settings.reduceMotion || Boolean(systemReducedMotion);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'shared'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState('comptoir');
  const [offline, setOffline] = useState(false);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const visible = useMemo(() => memories.filter((memory) => {
    const matchesQuery = [memory.restaurant, memory.city, memory.country, ...memory.tags].join(' ').toLowerCase().includes(query.toLowerCase().trim());
    return matchesQuery && (filter === 'all' || (filter === 'favorites' && (memory.saved || memory.liked)) || (filter === 'shared' && memory.shared));
  }), [memories, query, filter]);
  const selected = visible.find((memory) => memory.id === selectedId) ?? visible.find((memory) => memory.id === 'comptoir') ?? visible[0];
  const distance = selected ? `${(L.latLng(48.8628, 2.3349).distanceTo(selected.coordinates) / 1000).toFixed(1)}km` : '';

  useEffect(() => {
    if (!mapElement.current) return;
    const instance = L.map(mapElement.current, {
      center: PARIS_CENTER, zoom: 14, zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 3, maxZoom: 18,
    });
    map.current = instance;
    instance.on('click', () => setShowFilters(false));
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, crossOrigin: true,
    }).addTo(instance);
    let errors = 0;
    tiles.on('tileerror', () => { errors += 1; if (errors > 2) setOffline(true); });
    tiles.on('tileload', () => setOffline(false));
    pins.current = L.layerGroup().addTo(instance);
    const timeout = window.setTimeout(() => instance.invalidateSize(), 350);
    return () => {
      window.clearTimeout(timeout);
      instance.remove();
      map.current = null;
      pins.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !pins.current) return;
    pins.current.clearLayers();
    visible.forEach((memory) => {
      const element = document.createElement('div');
      element.className = 'map-photo-pin';
      element.dataset.memoryId = memory.id;
      const image = document.createElement('img');
      image.src = memory.id === 'comptoir' ? photos.paris : memory.photo;
      image.alt = memory.restaurant;
      image.draggable = false;
      image.onerror = () => { image.onerror = null; image.src = photos.meal; };
      element.appendChild(image);
      const icon = L.divIcon({ className: 'photo-marker', html: element, iconSize: [44, 44], iconAnchor: [22, 22] });
      const marker = L.marker(memory.coordinates, { icon, title: memory.restaurant, keyboard: true, riseOnHover: true });
      marker.on('click', () => setSelectedId(memory.id));
      const label = document.createElement('span');
      label.textContent = memory.restaurant;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -24], className: 'savor-map-tooltip' });
      marker.addTo(pins.current!);
    });
  }, [visible]);

  useEffect(() => {
    // Update selection without replacing marker elements or losing keyboard focus.
    pins.current?.eachLayer((layer) => {
      if (!(layer instanceof L.Marker)) return;
      const element = layer.getElement()?.querySelector<HTMLElement>('.map-photo-pin');
      element?.classList.toggle('selected-pin', element.dataset.memoryId === selected?.id);
    });
  }, [visible, selected?.id]);

  useEffect(() => {
    if (!query.trim() && filter === 'all') return;
    const timeout = window.setTimeout(() => {
      if (!map.current || !visible.length) return;
      if (visible.length === 1) {
        map.current.setView(visible[0].coordinates, 15, { animate: !reduceMotion });
      } else {
        const bounds = L.latLngBounds(visible.map((memory) => memory.coordinates));
        map.current.fitBounds(bounds, { paddingTopLeft: [40, 90], paddingBottomRight: [40, 165], maxZoom: 15, animate: !reduceMotion });
      }
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [query, filter, visible, reduceMotion]);

  function recenter() {
    setQuery('');
    setFilter('all');
    setSelectedId('comptoir');
    setShowFilters(false);
    map.current?.setView(PARIS_CENTER, 14, { animate: !reduceMotion });
  }

  return <div className="map-screen" onKeyDown={(event) => { if (event.key === 'Escape') setShowFilters(false); }}>
    <div ref={mapElement} className="memory-map" aria-label="Interactive map of your food memories. Drag to explore, or use arrow keys and plus or minus to zoom." />
    <div className="map-top-fade" />
    <ScreenHeading title="Map First" subtitle="Explore where memories live." />
    <div className="map-search glass"><Search size={15} strokeWidth={1.5} /><input aria-label="Search restaurants, places, tags" placeholder="Search restaurants, places, tags" value={query} onChange={(event) => { setQuery(event.target.value); setShowFilters(false); }} />
      {query && <IconButton label="Clear search" className="clear-search" onClick={recenter}><X size={12} /></IconButton>}
      <IconButton label="Filter map memories" aria-expanded={showFilters} className={filter !== 'all' ? 'filter-active' : ''} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={14} strokeWidth={1.4} /></IconButton>
    </div>
    {showFilters && <div className="map-filter-menu glass" role="group" aria-label="Filter memories"><span>Show on the map</span>{(['all', 'favorites', 'shared'] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setShowFilters(false); if (value === 'all' && !query) recenter(); }}>{value === 'all' ? 'All memories' : value === 'favorites' ? 'Favorites only' : 'Our shared memories'}{filter === value && <Check size={14} />}</button>)}</div>}
    <IconButton className="recenter-map glass" label="Recenter on Paris" onClick={recenter}><Navigation size={16} strokeWidth={1.4} /></IconButton>
    {query && visible.length > 0 && <div className="map-results-count">{visible.length} {visible.length === 1 ? 'memory' : 'memories'} found</div>}
    {selected ? <div className="place-card glass">
      <button className="place-open" onClick={() => openSheet({ type: 'memory', id: selected.id })} aria-label={`View your memory at ${selected.restaurant}`}>
        <span className="place-copy"><strong>{selected.restaurant}</strong><span>{selected.tags[0] ?? 'A favorite'}<span className="text-dot" />{selected.tags.includes('Coffee') ? 'Cafe' : 'Bistro'}</span><span>{selected.city === 'Paris' ? distance : selected.neighborhood || 'A little escape'}<span className="text-dot" />{selected.city}, {selected.country}</span><span className="place-date">{formatDate(selected.date)}</span></span>
        <Photo src={selected.placePhoto ?? selected.photo} alt={`A moment in ${selected.city}`} />
      </button>
      <IconButton className="bookmark-place" label={selected.saved ? 'Remove from saved places' : 'Save this place'} aria-pressed={selected.saved} onClick={() => { updateMemory(selected.id, { saved: !selected.saved }); notify(selected.saved ? 'Place removed from your favorites.' : 'A good place to come back to. Saved.'); }}><Bookmark size={15} strokeWidth={1.3} fill={selected.saved ? 'currentColor' : 'none'} /></IconButton>
    </div> : <div className="map-empty glass"><Search size={24} strokeWidth={1} /><h3>No memories here yet.</h3><p>Try another place, restaurant, or tag.</p><button onClick={recenter}>Show all memories</button></div>}
    {offline && <span className="map-offline-note">Offline map preview</span>}
    <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><span>/</span><a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a></div>
  </div>;
}