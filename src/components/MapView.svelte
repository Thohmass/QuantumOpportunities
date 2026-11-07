<script lang="ts">
  // Lazy-loaded with Leaflet: nothing here is in the initial bundle.
  import { onDestroy, onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet.markercluster';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet.markercluster/dist/MarkerCluster.css';
  import { formatRange } from '../lib/dates';
  import type { Ev } from '../lib/model';
  import { app, hover, openEvent } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let { events, meta, compact = false }: { events: Ev[]; meta: Meta; compact?: boolean } = $props();

  let el: HTMLDivElement;
  let map: L.Map | undefined;
  let cluster: L.MarkerClusterGroup | undefined;
  let halo: L.CircleMarker | undefined;
  const markers = new Map<string, L.Marker>();
  let fitted = false;

  const located = $derived(events.filter((e) => e.lat !== undefined && e.lon !== undefined));
  const online = $derived(events.filter((e) => e.format === 'online').length);

  // OpenStreetMap's standard tiles: no API key. Dark mode darkens them with a CSS filter (see styles below).
  const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  // The selected event's marker is ringed in its type colour.
  let picked: string | undefined;
  $effect(() => {
    const id = app.eventId;
    const prev = picked;
    picked = id;
    for (const pid of [prev, id]) {
      const e = pid ? located.find((x) => x.id === pid) : undefined;
      if (e) markers.get(e.id)?.setIcon(icon(e));
    }
  });

  // One world, no wrapping: you can't pan past the poles or the date line.
  const WORLD = L.latLngBounds([-75, -180], [85, 180]);
  /** The hover dot grows as you zoom in, so it never covers a whole region when zoomed out. */
  const dotRadius = (z: number) => Math.max(4, Math.min(14, 2 + z * 1.6));

  function icon(e: Ev): L.DivIcon {
    const cls = [
      'qo-pin',
      `t-${e.type}`,
      e.status,
      e.isPast ? 'past' : '',
      picked === e.id ? 'picked' : '',
    ].join(' ');
    return L.divIcon({
      className: cls,
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function publishBounds() {
    if (!map) return;
    const b = map.getBounds();
    app.mapBounds = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  }

  onMount(() => {
    map = L.map(el, {
      zoomControl: true,
      minZoom: 1,
      maxBounds: WORLD,
      maxBoundsViscosity: 1,
      attributionControl: true,
    }).setView([35, 10], 2);
    // Never zoom out further than the world fills the map.
    const fitMin = () => map && map.setMinZoom(Math.max(1, map.getBoundsZoom(WORLD, true)));
    fitMin();
    map.on('resize', fitMin);
    map.on('zoomend', () => halo?.setRadius(dotRadius(map!.getZoom())));
    L.tileLayer(TILES, {
      noWrap: true,
      bounds: WORLD,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 44,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) =>
        L.divIcon({
          className: 'qo-cluster',
          html: `<span>${c.getChildCount()}</span>`,
          iconSize: [34, 34],
        }),
    });
    map.addLayer(cluster);
    map.on('moveend', publishBounds);
    return () => map?.off('moveend', publishBounds);
  });
  onDestroy(() => {
    map?.remove();
    app.mapBounds = undefined;
  });

  // Rebuild markers when the filtered set changes.
  $effect(() => {
    const list = located;
    if (!map || !cluster) return;
    cluster.clearLayers();
    markers.clear();
    for (const e of list) {
      const m = L.marker([e.lat!, e.lon!], {
        icon: icon(e),
        title: e.name,
        keyboard: true,
        riseOnHover: true,
      });
      m.bindTooltip(
        `<b>${escapeHtml(e.name)}</b><br>${formatRange(e.dates.start, e.dates.end)}${e.city ? ' · ' + escapeHtml(e.city) : ''}`,
        {
          direction: 'top',
          offset: [0, -8],
        },
      );
      m.on('click', () => openEvent(e.id, true));
      m.on('mouseover', () => hover(e.id));
      m.on('mouseout', () => hover(undefined));
      markers.set(e.id, m);
      cluster.addLayer(m);
    }
    if (!fitted && list.length) {
      fitToResults();
      fitted = true;
    }
    publishBounds();
  });

  // Highlight the hovered event (even inside a cluster) with a small dot and its tooltip; both go away when
  // the pointer leaves it, wherever the hover came from.
  let openTip: L.Marker | undefined;
  $effect(() => {
    const id = app.hoverId;
    if (!map) return;
    halo?.remove();
    halo = undefined;
    openTip?.closeTooltip();
    openTip = undefined;
    const e = id ? located.find((x) => x.id === id) : undefined;
    if (!e) return;
    halo = L.circleMarker([e.lat!, e.lon!], {
      radius: dotRadius(map.getZoom()),
      className: 'qo-halo',
      interactive: false,
    }).addTo(map);
    const m = markers.get(e.id);
    if (m && cluster?.getVisibleParent(m) === m) {
      m.openTooltip();
      openTip = m;
    }
  });

  // An event selected in the list or timeline: fly there and show it.
  $effect(() => {
    void app.focusTick;
    const id = app.eventId;
    if (!map || !id) return;
    const e = located.find((x) => x.id === id);
    if (!e) return;
    map.flyTo([e.lat!, e.lon!], Math.max(map.getZoom(), 5), { duration: 0.8 });
  });

  function fitToResults() {
    if (!map || !located.length) return;
    const b = L.latLngBounds(located.map((e) => [e.lat!, e.lon!] as [number, number]));
    map.fitBounds(b.pad(0.25), { maxZoom: 6 });
  }

  function escapeHtml(s: string): string {
    return s.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  }
</script>

<section class="mapview" class:compact aria-label="Map">
  <div class="map" bind:this={el}></div>
  <div class="overlay">
    <button class="btn" type="button" onclick={fitToResults}>Fit to results</button>
    <label class="btn toggle" title="Hide events outside the visible map area in the other views">
      <input type="checkbox" bind:checked={app.mapOnly} /> Only map area
    </label>
    {#if online}
      <button
        class="btn"
        type="button"
        onclick={() => {
          app.filters.continents = ['online'];
          if (!compact) app.view = 'list';
        }}>🌐 {online} online</button
      >
    {/if}
  </div>
  <span class="sr-only">{located.length} events on the map. {meta.types.length} event types.</span>
</section>

<style>
  .mapview {
    position: relative;
    height: calc(100dvh - var(--header-h) - 60px);
    min-height: 360px;
    margin: 8px 0 16px;
  }
  .mapview.compact {
    height: 100%;
    min-height: 0;
    margin: 0;
  }
  .map {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    overflow: hidden;
    z-index: 0;
    background: var(--surface-2);
  }
  .overlay {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    z-index: 5;
  }
  .overlay .btn {
    min-height: 34px;
    padding: 5px 10px;
    font-size: 0.82rem;
    box-shadow: var(--shadow);
  }
  .toggle {
    cursor: pointer;
  }
  .toggle input {
    accent-color: var(--accent);
  }
  :global(.qo-pin span) {
    display: block;
    width: 14px;
    height: 14px;
    margin: 2px;
    border-radius: 50%;
    background: var(--tc);
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--tc);
  }
  :global(.qo-pin.expected span) {
    background: repeating-linear-gradient(135deg, var(--tc) 0 3px, var(--surface) 3px 6px);
    border-color: var(--tc);
    box-shadow: none;
  }
  :global(.qo-pin.postponed span),
  :global(.qo-pin.cancelled span) {
    background: var(--surface);
    border: 2px dashed var(--warn);
    box-shadow: none;
  }
  :global(.qo-pin.past span) {
    filter: grayscale(0.85);
    opacity: 0.6;
  }
  :global(.qo-pin.picked span) {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--tc);
  }
  :global(.qo-cluster) {
    background: color-mix(in srgb, var(--ink) 18%, transparent);
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  :global(.qo-cluster span) {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    font-weight: 700;
    font-size: 0.8rem;
  }
  :global(.qo-halo) {
    fill: var(--warn);
    fill-opacity: 0.35;
    stroke: var(--warn);
    stroke-width: 2;
  }
  :global(.leaflet-container) {
    font: inherit;
    background: var(--surface-2);
  }
  :global(:root[data-theme='dark'] .leaflet-tile-pane) {
    filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.85) saturate(0.6);
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light']) .leaflet-tile-pane) {
      filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.85) saturate(0.6);
    }
  }
  :global(.leaflet-tooltip) {
    font-size: 0.82rem;
  }
</style>
