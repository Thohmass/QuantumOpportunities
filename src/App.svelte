<script lang="ts">
  import { onMount } from 'svelte';
  import About from './components/About.svelte';
  import Chips from './components/Chips.svelte';
  import EventDetail from './components/EventDetail.svelte';
  import FilterPanel from './components/FilterPanel.svelte';
  import Header from './components/Header.svelte';
  import ListView from './components/ListView.svelte';
  import TimelineView from './components/TimelineView.svelte';
  import { applyFilters, facetCounts, sortEvents, topicTree, type Ctx } from './lib/filters';
  import { enrich, localToday, type Ev } from './lib/model';
  import { buildIndex, search } from './lib/search';
  import { app } from './lib/state.svelte';
  import type { EventOut, Meta } from './lib/types';
  import { fromHash, toHash } from './lib/url';
  import type MiniSearch from 'minisearch';

  const today = localToday();
  let meta: Meta | undefined = $state();
  let events: Ev[] = $state([]);
  let index: MiniSearch | undefined;
  let error = $state('');

  // ---- URL ⇄ state -------------------------------------------------------
  const defaultView = () => (window.matchMedia('(min-width: 1100px)').matches ? 'explore' : 'list');
  function readHash() {
    const r = fromHash(location.hash, defaultView());
    app.view = r.view;
    app.filters = r.filters;
    app.eventId = r.event;
  }
  readHash();
  let lastView = app.view;
  let lastEvent = app.eventId;
  $effect(() => {
    const hash = toHash({ view: app.view, filters: app.filters, event: app.eventId });
    if (hash === location.hash) return;
    // View switches and opening/closing an event get their own history entry (back button works);
    // typing and filter changes replace the current one.
    const push = app.view !== lastView || app.eventId !== lastEvent;
    history[push ? 'pushState' : 'replaceState'](null, '', hash);
    lastView = app.view;
    lastEvent = app.eventId;
  });
  onMount(() => {
    const onPop = () => {
      readHash();
      lastView = app.view;
      lastEvent = app.eventId;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  // ---- data ---------------------------------------------------------------
  onMount(async () => {
    try {
      const [ev, m] = await Promise.all([
        fetch('./data/events.json').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('./data/meta.json').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);
      meta = m as Meta;
      events = (ev as EventOut[]).map((e) => enrich(e, m, today));
      index = buildIndex(events, m);
      // Old links to merged/renamed events still open the right one.
      if (app.eventId && meta.redirects[app.eventId]) app.eventId = meta.redirects[app.eventId];
    } catch {
      error = 'The event data could not be loaded. Check your connection and reload the page.';
    }
  });

  // ---- derived ------------------------------------------------------------
  const tree = $derived(meta ? topicTree(meta) : new Map());
  const ctx = $derived.by((): Ctx | undefined => {
    if (!meta) return undefined;
    return {
      meta,
      today,
      topicTree: tree,
      searchHits: index ? search(index, app.filters.q) : undefined,
    };
  });
  const all = $derived(
    ctx ? sortEvents(applyFilters(events, app.filters, ctx), app.filters.sort) : [],
  );
  // The timeline shows events outside the selected dates too (dimmed), so a selection never loses context.
  const noDates = $derived(ctx ? applyFilters(events, { ...app.filters, when: 'any' }, ctx) : []);
  // The visible map area is a lens: outside it, events are dimmed (or hidden with "Only map area").
  const usesMap = $derived(app.view === 'explore' || app.view === 'map');
  const outsideMap = $derived.by(() => {
    const b = app.mapBounds;
    const out = new Set<string>();
    if (!b || !usesMap) return out;
    const [s, w, n, e] = b;
    for (const ev of events) {
      if (ev.lat === undefined || ev.lon === undefined) continue; // online: never dimmed by the map
      const inLon = w <= e ? ev.lon >= w && ev.lon <= e : ev.lon >= w || ev.lon <= e;
      if (!(ev.lat >= s && ev.lat <= n && inLon)) out.add(ev.id);
    }
    return out;
  });
  const filtered = $derived(
    app.mapOnly && usesMap ? all.filter((e) => !outsideMap.has(e.id)) : all,
  );
  const timelineEvents = $derived(
    app.mapOnly && usesMap ? noDates.filter((e) => !outsideMap.has(e.id)) : noDates,
  );
  const counts = $derived(ctx ? facetCounts(events, app.filters, ctx) : undefined);
  // Load the map code (Leaflet) only when a view with a map is first opened.
  let mapPromise: Promise<typeof import('./components/MapView.svelte')> | undefined;
  const mapModule = $derived.by(() => {
    if (app.view === 'explore' || app.view === 'map')
      mapPromise ??= import('./components/MapView.svelte');
    return mapPromise;
  });
  const selected = $derived(app.eventId ? events.find((e) => e.id === app.eventId) : undefined);

  // Lock page scroll behind the mobile filter drawer.
  $effect(() => {
    document.body.style.overflow = app.filtersOpen && window.innerWidth < 960 ? 'hidden' : '';
  });
</script>

<Header shown={filtered.length} total={events.filter((e) => !e.isPast).length} />

{#if error}
  <p class="error" role="alert">{error}</p>
{:else if !meta || !counts}
  <p class="loading" aria-busy="true">Loading events…</p>
{:else}
  <div
    class="layout"
    class:wide={app.view === 'timeline' || app.view === 'map' || app.view === 'explore'}
    class:single={app.view === 'about'}
  >
    {#if app.view !== 'about'}
      <aside class="sidebar" class:open={app.filtersOpen} aria-label="Filters">
        <FilterPanel {meta} {counts} shown={filtered.length} />
      </aside>
      {#if app.filtersOpen}<div
          class="scrim"
          aria-hidden="true"
          onclick={() => (app.filtersOpen = false)}
        ></div>{/if}
    {/if}
    <main id="main">
      {#if app.view !== 'about'}<Chips {meta} />{/if}
      {#if app.view === 'explore'}
        <div class="explore">
          <div class="pane map-pane">
            {#await mapModule}
              <p class="loading">Loading map…</p>
            {:then M}
              {#if M}<M.default events={all} {meta} compact />{/if}
            {:catch}
              <p class="error">The map could not be loaded.</p>
            {/await}
          </div>
          <div class="pane timeline-pane">
            <TimelineView events={timelineEvents} {today} dimmed={outsideMap} compact />
          </div>
          <div class="pane list-pane">
            <ListView events={filtered} {meta} {today} dimmed={outsideMap} compact />
          </div>
        </div>
      {:else if app.view === 'list'}
        <ListView events={filtered} {meta} {today} />
      {:else if app.view === 'timeline'}
        <TimelineView events={timelineEvents} {today} />
      {:else if app.view === 'map'}
        {#await mapModule}
          <p class="loading">Loading map…</p>
        {:then M}
          {#if M}<M.default events={all} {meta} />{/if}
        {:catch}
          <p class="error">The map could not be loaded.</p>
        {/await}
      {:else}
        <About {meta} {events} {today} />
      {/if}
    </main>
  </div>
  {#if selected}
    <EventDetail e={selected} {meta} {today} />
  {/if}
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    max-width: 1280px;
    margin: 0 auto;
  }
  .layout.wide {
    max-width: none;
  }
  main {
    padding: 0 max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left));
    min-width: 0;
  }
  .sidebar {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(380px, 92vw);
    background: var(--surface);
    z-index: 45;
    overflow-y: auto;
    overscroll-behavior: contain;
    transform: translateX(100%);
    transition: transform 0.2s ease-out;
    border-left: 1px solid var(--line);
    visibility: hidden;
  }
  .sidebar.open {
    transform: none;
    visibility: visible;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 35%);
    z-index: 44;
  }
  @media (min-width: 960px) {
    .layout {
      grid-template-columns: 290px minmax(0, 1fr);
    }
    .sidebar {
      position: sticky;
      top: var(--header-h);
      height: calc(100dvh - var(--header-h));
      transform: none;
      visibility: visible;
      width: auto;
      z-index: 1;
      background: transparent;
      border-left: 0;
      border-right: 1px solid var(--line);
    }
    .scrim {
      display: none;
    }
    main {
      padding: 0 20px;
    }
    .layout.single {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .explore {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(340px, 1fr);
    grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
    grid-template-areas:
      'map list'
      'timeline list';
    gap: 12px;
    height: calc(100dvh - var(--header-h) - 58px);
    min-height: 560px;
    padding: 8px 0 12px;
  }
  .pane {
    min-height: 0;
    min-width: 0;
  }
  .map-pane {
    grid-area: map;
  }
  .timeline-pane {
    grid-area: timeline;
  }
  .list-pane {
    grid-area: list;
    overflow-y: auto;
    padding-right: 4px;
    overscroll-behavior: contain;
  }
  .loading,
  .error {
    text-align: center;
    padding: 60px 16px;
    color: var(--muted);
  }
  .error {
    color: var(--warn);
  }
</style>
