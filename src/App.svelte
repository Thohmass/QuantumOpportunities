<script lang="ts">
  import { onMount, untrack } from 'svelte';
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
  import { suggestionPool } from './lib/suggest';
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
      searchHits: index
        ? search(index, [...app.filters.terms, app.filters.q].join(' '))
        : undefined,
    };
  });
  const all = $derived(
    ctx ? sortEvents(applyFilters(events, app.filters, ctx), app.filters.sort) : [],
  );
  // The timeline shows events outside the selected dates too (dimmed), so a selection never loses context.
  const noDates = $derived(ctx ? applyFilters(events, { ...app.filters, when: 'any' }, ctx) : []);
  // Dimmed = uncertain: expected editions are drawn faint in the list and timeline.
  const expectedIds = $derived(
    new Set(all.filter((e) => e.status === 'expected').map((e) => e.id)),
  );
  // The visible map area is a lens: with "Only map area", events outside it are hidden from the other views.
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
  // Filter options offered by the search box while typing.
  const suggestPool = $derived(
    meta && universe && counts ? suggestionPool(meta, universe, counts) : [],
  );
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
  // The list is a drawer on phones and narrow windows, and when the map or the timeline is expanded. It
  // slides out when an event is selected, or from the List button in the header.
  const drawerMode = $derived(
    app.view === 'map' || app.view === 'timeline' || (narrow && app.view === 'explore'),
  );
  $effect(() => {
    app.drawerMode = drawerMode;
    if (!drawerMode) app.listDrawer = false;
  });
  $effect(() => {
    if (app.eventId && untrack(() => drawerMode)) app.listDrawer = true;
  });
  const listOnScreen = $derived(
    app.view === 'list' ||
      (app.view === 'explore' && !narrow && !listHidden) ||
      (drawerMode && app.listDrawer),
  );
  // Details: with a list on screen, the card unfolds and "More details" opens everything. Without one, the
  // details open directly: in the centred pop-up on Explore, in the side panel in the Map and Timeline views.
  const panelEvent = $derived(
    selected && (app.detailOpen || (!listOnScreen && !drawerMode)) ? selected : undefined,
  );
  // Details always open as the centred pop-up (a bottom sheet on phones).
  const popup = true;
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

  // Lock page scroll behind the mobile filter and list drawers.
  $effect(() => {
    document.body.style.overflow =
      (app.filtersOpen || app.listDrawer) && window.innerWidth < 960 ? 'hidden' : '';
  });
  // Phones: the list drawer follows the finger. Drag the tab on the right edge to the left to pull it out;
  // swipe the open drawer to the right to push it away. A short flick is enough; letting go part-way snaps.
  let drawerEl: HTMLDivElement | undefined = $state();
  let tabEl: HTMLButtonElement | undefined = $state();
  let swipe:
    { x0: number; y0: number; t0: number; dx: number; opening: boolean; on: boolean } | undefined =
    $state();
  const drawerShift = $derived.by(() => {
    if (!swipe?.on) return undefined;
    const w = drawerEl?.offsetWidth ?? window.innerWidth;
    return swipe.opening ? Math.max(0, w + swipe.dx) : Math.max(0, swipe.dx);
  });
  function swipeStart(ev: TouchEvent, opening: boolean) {
    if (ev.touches.length !== 1) return;
    const p = ev.touches[0]!;
    swipe = { x0: p.clientX, y0: p.clientY, t0: performance.now(), dx: 0, opening, on: opening };
    if (opening) app.listDrawer = true;
  }
  function swipeMove(ev: TouchEvent) {
    if (!swipe || ev.touches.length !== 1) return;
    const p = ev.touches[0]!;
    const dx = p.clientX - swipe.x0;
    const dy = p.clientY - swipe.y0;
    if (!swipe.on) {
      // Decide once: a mostly sideways move to the right closes; anything else is ordinary scrolling.
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) || dx < 0) {
        swipe = undefined;
        return;
      }
      swipe.on = true;
    }
    ev.preventDefault();
    swipe.dx = dx;
  }
  function swipeEnd() {
    if (!swipe) return;
    const s = swipe;
    swipe = undefined;
    if (!s.on) return;
    const w = drawerEl?.offsetWidth ?? window.innerWidth;
    const speed = s.dx / Math.max(1, performance.now() - s.t0); // px per ms
    if (s.opening) app.listDrawer = -s.dx > w * 0.25 || speed < -0.4 || Math.abs(s.dx) < 6;
    else app.listDrawer = !(s.dx > w * 0.25 || speed > 0.4);
  }
  $effect(() => {
    const tab = tabEl;
    if (!tab) return;
    // The tab stays in the page (under the drawer) until the finger lifts, so it keeps getting the moves.
    const start = (e: TouchEvent) => swipeStart(e, true);
    tab.addEventListener('touchstart', start, { passive: true });
    tab.addEventListener('touchmove', swipeMove, { passive: false });
    tab.addEventListener('touchend', swipeEnd);
    tab.addEventListener('touchcancel', swipeEnd);
    return () => {
      tab.removeEventListener('touchstart', start);
      tab.removeEventListener('touchmove', swipeMove);
      tab.removeEventListener('touchend', swipeEnd);
      tab.removeEventListener('touchcancel', swipeEnd);
    };
  });
  $effect(() => {
    const el = drawerEl;
    if (!el) return;
    const start = (e: TouchEvent) => {
      if (!swipe) swipeStart(e, false);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', swipeMove, { passive: false });
    el.addEventListener('touchend', swipeEnd);
    el.addEventListener('touchcancel', swipeEnd);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', swipeMove);
      el.removeEventListener('touchend', swipeEnd);
      el.removeEventListener('touchcancel', swipeEnd);
    };
  });

  function drawerKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && app.listDrawer && !app.detailOpen) app.listDrawer = false;
  }
</script>

<svelte:window onkeydown={drawerKey} />
<Header shown={filtered.length} total={events.filter((e) => !e.isPast).length} pool={suggestPool} />

{#if error}
  <p class="error" role="alert">{error}</p>
{:else if !meta || !counts || !universe}
  <p class="loading" aria-busy="true">Loading events…</p>
{:else}
  <div
    class="layout"
    class:wide={app.view !== 'about'}
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
    <main
      id="main"
      class:workspace={(app.view === 'explore' && !narrow) ||
        app.view === 'map' ||
        app.view === 'timeline'}
    >
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
              dimmed={expectedIds}
              compact
              fit={narrow}
            />
          </div>
          {#if !listHidden && !narrow}
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
              <ListView events={filtered} {meta} {today} dimmed={expectedIds} compact panel />
            </div>
          {/if}
        </div>
      {:else if app.view === 'list'}
        <ListView events={filtered} {meta} {today} dimmed={expectedIds} panel />
      {:else if app.view === 'timeline'}
        <TimelineView events={timelineEvents} {today} dimmed={expectedIds} />
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
  {#if drawerMode && narrow && (!app.listDrawer || swipe?.opening)}
    <!-- Phones: a tab in thumb reach; tap it, or drag it to the left, to pull out the list. -->
    <button
      class="pull-tab"
      type="button"
      bind:this={tabEl}
      aria-label="Open the list ({filtered.length} events)"
      onclick={() => (app.listDrawer = true)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
        ><path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
      <span>{filtered.length}</span>
    </button>
  {/if}
  {#if drawerMode && app.listDrawer}
    <div
      class="drawer-scrim"
      aria-hidden="true"
      style:opacity={drawerShift !== undefined && drawerEl
        ? 1 - drawerShift / drawerEl.offsetWidth
        : undefined}
      onclick={() => (app.listDrawer = false)}
    ></div>
    <div
      class="list-drawer"
      class:dragging={drawerShift !== undefined}
      role="dialog"
      aria-label="Events"
      bind:this={drawerEl}
      style:transform={drawerShift !== undefined ? `translateX(${drawerShift}px)` : undefined}
    >
      <div class="drawer-head">
        <b>Events</b>
        <button
          class="btn ghost"
          type="button"
          aria-label="Close the list"
          onclick={() => (app.listDrawer = false)}>✕</button
        >
      </div>
      <ListView events={filtered} {meta} {today} dimmed={expectedIds} compact />
    </div>
  {/if}
  {#if panelEvent}
    <EventDetail e={panelEvent} {meta} {today} {popup} onclose={closeDetail} />
  {/if}
{/if}

<style>
  /* The list as a drawer (phones; expanded map or timeline): slides in from the right, below the header. */
  .drawer-scrim {
    position: fixed;
    inset: var(--header-h) 0 0 0;
    background: rgb(0 0 0 / 25%);
    z-index: 44;
  }
  .list-drawer {
    position: fixed;
    top: var(--header-h);
    right: 0;
    bottom: 0;
    width: min(460px, 100vw);
    z-index: 45;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--bg);
    border-left: 1px solid var(--line);
    box-shadow: var(--shadow);
    padding: 10px 14px max(20px, env(safe-area-inset-bottom));
    animation: drawer-in 0.18s ease-out;
  }
  @keyframes drawer-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .list-drawer {
      animation: none;
    }
  }
  .list-drawer {
    /* Vertical scrolling stays native; sideways moves are ours (swipe to close). */
    touch-action: pan-y;
    transition: transform 0.2s ease-out;
  }
  .list-drawer.dragging {
    transition: none;
    animation: none;
  }
  .pull-tab {
    position: fixed;
    right: 0;
    top: 62%;
    z-index: 30;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 12px 6px 12px 8px;
    border: 1px solid var(--line);
    border-right: 0;
    border-radius: 12px 0 0 12px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
    font-size: 0.78rem;
    font-weight: 700;
    touch-action: none;
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    max-width: 1280px;
    margin: 0 auto;
  }
  .layout.wide {
    max-width: none;
  }
  /* Panels run edge to edge (no frame around them); text-only pages keep a margin. */
  main {
    padding: 0;
    min-width: 0;
  }
  .layout.single main {
    padding: 0 max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left));
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
    gap: 6px 10px;
    flex-wrap: wrap;
    padding: 4px 10px;
  }
  .bar:not(:has(.chips :global(*))) .chips {
    display: none;
  }
  @media (max-width: 959px) {
    /* Phones: the bar only holds filter chips; without any it takes no space. */
    .bar:not(:has(.chips :global(*))) {
      display: none;
    }
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
    padding: 0;
  }
  /* Desktop Explore: the workspace fills the window exactly, down to its bottom edge (no page scroll). */
  main.workspace {
    display: flex;
    flex-direction: column;
    height: calc(100dvh - var(--header-h));
    min-height: 520px;
  }
  /* An expanded map or timeline fills the rest of the window too. */
  main.workspace > :global(.mapview),
  main.workspace > :global(.timeline) {
    flex: 1;
    height: auto;
    min-height: 0;
    margin: 0;
  }
  main.workspace .explore {
    flex: 1;
    min-height: 0;
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
      gap: 0;
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
    padding: 0 10px 0 0;
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
