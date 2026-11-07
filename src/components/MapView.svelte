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

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const TILES = `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;

  function icon(e: Ev): L.DivIcon {
    const cls = ['qo-pin', e.status, e.isPast ? 'past' : ''].join(' ');
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
      worldCopyJump: true,
      minZoom: 2,
      attributionControl: true,
    }).setView([35, 10], 2);
    L.tileLayer(TILES, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" rel="noopener">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 18,
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
      m.on('click', () => openEvent(e.id));
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

  // Highlight the hovered event, even when it sits inside a cluster.
  $effect(() => {
    const id = app.hoverId;
    if (!map) return;
    halo?.remove();
    halo = undefined;
    const e = id ? located.find((x) => x.id === id) : undefined;
    if (!e) return;
    halo = L.circleMarker([e.lat!, e.lon!], {
      radius: 16,
      className: 'qo-halo',
      interactive: false,
    }).addTo(map);
    const m = markers.get(e.id);
    const visible = m && cluster?.getVisibleParent(m) === m;
    if (visible) m!.openTooltip();
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
    background: var(--accent);
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--accent);
  }
  :global(.qo-pin.expected span) {
    background: var(--surface);
    border: 2.5px dashed var(--expected);
    box-shadow: none;
  }
  :global(.qo-pin.postponed span),
  :global(.qo-pin.cancelled span) {
    background: var(--warn);
    box-shadow: 0 0 0 1px var(--warn);
  }
  :global(.qo-pin.past span) {
    background: var(--past);
    box-shadow: 0 0 0 1px var(--past);
  }
  :global(.qo-cluster) {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
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
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.8rem;
  }
  :global(.qo-halo) {
    fill: var(--warn);
    fill-opacity: 0.18;
    stroke: var(--warn);
    stroke-width: 2.5;
  }
  :global(.leaflet-container) {
    font: inherit;
    background: var(--surface-2);
  }
  :global(.leaflet-tooltip) {
    font-size: 0.82rem;
  }
</style>
