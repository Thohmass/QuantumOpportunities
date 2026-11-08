<script lang="ts">
  import { onMount } from 'svelte';
  import About from './components/About.svelte';
  import Chips from './components/Chips.svelte';
  import EventDetail from './components/EventDetail.svelte';
  import FilterPanel from './components/FilterPanel.svelte';
  import Header from './components/Header.svelte';
  import ListView from './components/ListView.svelte';
  import Resizer from './components/Resizer.svelte';
  import TimelineView from './components/TimelineView.svelte';
  import {
    applyFilters,
    facetCounts,
    facetUniverse,
    sortEvents,
    topicTree,
    type Ctx,
  } from './lib/filters';
  import { enrich, localToday, type Ev } from './lib/model';
  import { buildIndex, search } from './lib/search';
  import { SPLIT, WIDTHS, app, prefs, setPref, setSplit, setWidth } from './lib/state.svelte';
  import type { EventOut, Meta } from './lib/types';
  import { fromHash, toHash } from './lib/url';
  import type MiniSearch from 'minisearch';

  const today = localToday();
  let meta: Meta | undefined = $state();
  let events: Ev[] = $state([]);
  let index: MiniSearch | undefined;
  let error = $state('');

  // ---- URL ⇄ state -------------------------------------------------------
  const defaultView = () => 'explore' as const;
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
  const universe = $derived(ctx ? facetUniverse(events, ctx) : undefined);
  // Load the map code and world geometry only when a view with a map is first opened.
  let mapPromise: Promise<typeof import('./components/MapView.svelte')> | undefined;
  const mapModule = $derived.by(() => {
    if (app.view === 'explore' || app.view === 'map')
      mapPromise ??= import('./components/MapView.svelte');
    return mapPromise;
  });
  const selected = $derived(app.eventId ? events.find((e) => e.id === app.eventId) : undefined);

  // Desktop (≥ 1100 px) is a workspace that fills the window: filters | map + timeline | list, with draggable
  // borders and panels that can be hidden. Narrower screens stack everything in one scrolling page.
  const mq = matchMedia('(max-width: 1099px)');
  let narrow = $state(mq.matches);
  onMount(() => {
    const on = () => (narrow = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const listHidden = $derived(app.view === 'explore' && !narrow && prefs.list === 'hidden');
  const listOnScreen = $derived(app.view === 'list' || (app.view === 'explore' && !listHidden));
  // Details: with a list on screen, the card unfolds and "More details" opens everything. Without one, the
  // details open directly: in the centred pop-up on Explore, in the side panel in the Map and Timeline views.
  const panelEvent = $derived(selected && (!listOnScreen || app.detailOpen) ? selected : undefined);
  const popup = $derived(app.view === 'explore' || (listOnScreen && app.detailOpen));
  $effect(() => {
    void app.eventId;
    app.detailOpen = false;
  });
  function closeDetail() {
    if (listOnScreen) app.detailOpen = false;
    else app.eventId = undefined;
  }

  // Explore: drag the bar between the map and the timeline to share the height between them.
  let exploreEl: HTMLDivElement | undefined = $state();
  let splitting = $state(false);
  function splitDown(ev: PointerEvent) {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    splitting = true;
  }
  function splitMove(ev: PointerEvent) {
    if (!splitting || !exploreEl) return;
    const r = exploreEl.getBoundingClientRect();
    setSplit((ev.clientY - r.top) / r.height);
  }
  function splitKey(ev: KeyboardEvent) {
    const step = ev.key === 'ArrowUp' ? -0.05 : ev.key === 'ArrowDown' ? 0.05 : 0;
    if (step) {
      ev.preventDefault();
      setSplit(prefs.split + step);
    }
  }

  // Theme: "system" follows the device; light/dark are fixed choices.
  $effect(() => {
    if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
  });
  const sidebarHidden = $derived(prefs.sidebar === 'hidden');

  // Lock page scroll behind the mobile filter drawer.
  $effect(() => {
    document.body.style.overflow = app.filtersOpen && window.innerWidth < 960 ? 'hidden' : '';
  });
</script>

<Header shown={filtered.length} total={events.filter((e) => !e.isPast).length} />

{#if error}
  <p class="error" role="alert">{error}</p>
{:else if !meta || !counts || !universe}
  <p class="loading" aria-busy="true">Loading events…</p>
{:else}
  <div
    class="layout"
    class:wide={app.view === 'timeline' || app.view === 'map' || app.view === 'explore'}
    class:single={app.view === 'about'}
    class:nosidebar={sidebarHidden}
    style:--filters-w="{prefs.filtersW}px"
  >
    {#if app.view !== 'about'}
      <aside class="sidebar" class:open={app.filtersOpen} aria-label="Filters">
        <FilterPanel {meta} {counts} {universe} shown={filtered.length} />
      </aside>
      {#if !sidebarHidden}
        <div class="filters-split">
          <Resizer
            value={prefs.filtersW}
            min={WIDTHS.filters.min}
            max={WIDTHS.filters.max}
            label="Resize the filters"
            onresize={(v) => setWidth('filters', v)}
            onreset={() => setWidth('filters', WIDTHS.filters.initial)}
          />
        </div>
      {/if}
      {#if app.filtersOpen}<div
          class="scrim"
          aria-hidden="true"
          onclick={() => (app.filtersOpen = false)}
        ></div>{/if}
    {/if}
    <main id="main">
      {#if app.view !== 'about'}
        <div class="bar">
          <button
            class="btn ghost side-toggle"
            type="button"
            onclick={() => setPref('sidebar', sidebarHidden ? 'shown' : 'hidden')}
            aria-pressed={!sidebarHidden}
            title={sidebarHidden ? 'Show filters' : 'Hide filters'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
              ><path
                d="M4 5h16v14H4zM9 5v14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
              /></svg
            >
            {sidebarHidden ? 'Filters' : 'Hide filters'}
          </button>
          <div class="chips"><Chips {meta} /></div>
          {#if app.view === 'explore' && !narrow}
            <button
              class="btn ghost side-toggle"
              type="button"
              aria-pressed={!listHidden}
              onclick={() => setPref('list', listHidden ? 'shown' : 'hidden')}
              title={listHidden ? 'Show the list' : 'Hide the list'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
                ><path
                  d="M4 5h16v14H4zM15 5v14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                /></svg
              >
              {listHidden ? `List (${filtered.length})` : 'Hide list'}
            </button>
          {/if}
        </div>
      {/if}
      {#if app.view === 'explore'}
        <div
          class="explore"
          class:no-list={listHidden}
          class:splitting
          bind:this={exploreEl}
          style:--map-fr="{prefs.split}fr"
          style:--tl-fr="{1 - prefs.split}fr"
          style:--list-w="{prefs.listW}px"
        >
          <div class="pane map-pane">
            {#await mapModule}
              <p class="loading">Loading map…</p>
            {:then M}
              {#if M}<M.default events={all} {meta} compact />{/if}
            {:catch}
              <p class="error">The map could not be loaded.</p>
            {/await}
          </div>
          <!-- A focusable separator is the ARIA "window splitter" pattern; Svelte's check doesn't know it. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            class="split"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize map and timeline"
            aria-valuemin={SPLIT.min * 100}
            aria-valuemax={SPLIT.max * 100}
            aria-valuenow={Math.round(prefs.split * 100)}
            tabindex="0"
            title="Drag to resize · double-click to reset"
            onpointerdown={splitDown}
            onpointermove={splitMove}
            onpointerup={() => (splitting = false)}
            onpointercancel={() => (splitting = false)}
            ondblclick={() => setSplit(SPLIT.initial)}
            onkeydown={splitKey}
          ></div>
          <div class="pane timeline-pane">
            <TimelineView
              events={timelineEvents}
              {today}
              dimmed={outsideMap}
              compact
              fit={narrow}
            />
          </div>
          {#if !listHidden}
            {#if !narrow}
              <div class="vsplit">
                <Resizer
                  value={prefs.listW}
                  min={WIDTHS.list.min}
                  max={WIDTHS.list.max}
                  sign={-1}
                  label="Resize the list"
                  onresize={(v) => setWidth('list', v)}
                  onreset={() => setWidth('list', WIDTHS.list.initial)}
                />
              </div>
            {/if}
            <div class="pane list-pane">
              <ListView events={filtered} {meta} {today} dimmed={outsideMap} compact />
            </div>
          {/if}
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
  {#if panelEvent}
    <EventDetail e={panelEvent} {meta} {today} {popup} onclose={closeDetail} />
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
  .filters-split {
    display: none;
  }
  @media (min-width: 960px) {
    .layout {
      grid-template-columns: var(--filters-w) 0 minmax(0, 1fr);
    }
    /* The border between the filters and the content: a zero-width column whose handle overlaps both. */
    .filters-split {
      display: flex;
      justify-content: center;
      position: sticky;
      top: var(--header-h);
      height: calc(100dvh - var(--header-h));
      z-index: 2;
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
    .layout.single,
    .layout.nosidebar {
      grid-template-columns: minmax(0, 1fr);
    }
    .layout.nosidebar .sidebar,
    .layout.single .filters-split {
      display: none;
    }
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px 10px;
    flex-wrap: wrap;
    padding-top: 8px;
  }
  .chips {
    flex: 1;
    min-width: 0;
  }
  .side-toggle {
    min-height: 34px;
    padding: 4px 10px;
    font-size: 0.85rem;
  }
  @media (max-width: 959px) {
    .side-toggle {
      display: none;
    }
  }
  .explore.no-list {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'map'
      'split'
      'timeline';
  }
  .explore {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 12px minmax(0, var(--list-w));
    grid-template-rows: minmax(0, var(--map-fr)) 12px minmax(0, var(--tl-fr));
    grid-template-areas:
      'map vsplit list'
      'split vsplit list'
      'timeline vsplit list';
    gap: 0;
    height: calc(100dvh - var(--header-h) - 64px);
    min-height: 560px;
    padding: 8px 0 12px;
  }
  .pane {
    min-height: 0;
    min-width: 0;
  }
  /* Phones and tablets: map, then timeline, then the list in the page flow (scrolling the list scrolls the page). */
  .vsplit {
    grid-area: vsplit;
    display: flex;
    justify-content: center;
  }
  @media (max-width: 1099px) {
    .explore,
    .explore.no-list {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 40dvh auto auto;
      grid-template-areas:
        'map'
        'timeline'
        'list';
      gap: 12px;
      height: auto;
      min-height: 0;
    }
    .split {
      display: none;
    }
  }
  .map-pane {
    grid-area: map;
  }
  .split {
    grid-area: split;
    cursor: row-resize;
    touch-action: none;
    position: relative;
  }
  .split::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 4px;
    transform: translate(-50%, -50%);
    border-radius: 2px;
    background: var(--line);
  }
  .split:hover::after,
  .split:focus-visible::after,
  .splitting .split::after {
    background: var(--accent);
  }
  .splitting {
    cursor: row-resize;
    user-select: none;
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
  /* In the stacked page the list is part of the page: it must not be its own scroll box, or wheel and touch
     scrolling over it would stop there instead of moving the page. */
  @media (max-width: 1099px) {
    .list-pane {
      overflow: visible;
      overscroll-behavior: auto;
      padding-right: 0;
    }
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
