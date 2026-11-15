<script lang="ts">
  // Search with suggestions. Typing filters live. Matching filter options are listed below the box (arrows or
  // Tab to move, Enter to pick): picking one sets that filter. Enter on the text itself keeps it as a search
  // term (a chip) and clears the box for the next one; an event must match every term.
  // On phones the box is a magnifier button until it gets focus, then it takes the whole header row.
  // The active filters live in the box as chips. Those that don't fit are counted (+N); pointing at the box
  // (or tapping +N) unfolds all of them under it. The funnel at the right end opens the filters.
  import { activeChips } from '../lib/chips';
  import { FUNNEL } from '../lib/icons';
  import { app, prefs, resetFilters, setPref } from '../lib/state.svelte';
  import { suggest, type Suggestion } from '../lib/suggest';
  import type { Meta } from '../lib/types';
  import TypeIcon from './TypeIcon.svelte';

  let { pool, meta }: { pool: Suggestion[]; meta?: Meta } = $props();

  const chips = $derived(meta ? activeChips(meta) : []);
  // How many chips are cut off at the end of the box.
  let tokensEl: HTMLDivElement | undefined = $state();
  let hidden = $state(0);
  let showAll = $state(false);
  $effect(() => {
    const el = tokensEl;
    void chips.length;
    if (!el) {
      hidden = 0;
      return;
    }
    const measure = () => {
      const limit = el.clientWidth + 1;
      hidden = [...el.children].filter(
        (c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth > limit,
      ).length;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  });
  $effect(() => {
    if (!hidden) showAll = false;
  });

  /** Filters: the sidebar on desktop (shown or hidden), the drawer on phones and tablets. */
  function toggleFilters() {
    if (matchMedia('(max-width: 959px)').matches) app.filtersOpen = !app.filtersOpen;
    else setPref('sidebar', prefs.sidebar === 'hidden' ? 'shown' : 'hidden');
  }
  const filtersShown = $derived(app.filtersOpen || prefs.sidebar !== 'hidden');

  let input: HTMLInputElement | undefined = $state();
  let focused = $state(false);
  let active = $state(0);
  const list = $derived(focused ? suggest(pool, app.filters.q, app.filters) : []);
  const text = $derived(app.filters.q.trim());
  // Rows: the matching options, then "search for the text".
  const rows = $derived(list.length + (text ? 1 : 0));
  $effect(() => {
    void app.filters.q;
    active = 0;
  });

  export function focus() {
    input?.focus();
  }

  function pick(s: Suggestion) {
    app.filters = {
      ...app.filters,
      [s.key]: [...(app.filters[s.key] as string[]), s.value],
      q: '',
    };
  }
  function keepText() {
    const t = text.replace(/,/g, ' ').replace(/\s+/g, ' ');
    if (!t) return;
    app.filters = {
      ...app.filters,
      terms: app.filters.terms.includes(t) ? app.filters.terms : [...app.filters.terms, t],
      q: '',
    };
  }
  function choose(i: number) {
    if (i < list.length) pick(list[i]!);
    else keepText();
  }
  function key(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown' || (ev.key === 'Tab' && !ev.shiftKey && rows > 1)) {
      if (!rows) return;
      ev.preventDefault();
      active = (active + 1) % rows;
    } else if (ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey && rows > 1)) {
      if (!rows) return;
      ev.preventDefault();
      active = (active - 1 + rows) % rows;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (rows) choose(active);
    } else if (ev.key === 'Escape') {
      if (app.filters.q) app.filters.q = '';
      else input?.blur();
    } else if (ev.key === 'Backspace' && !app.filters.q && app.filters.terms.length) {
      // Backspace in an empty box removes the last term.
      app.filters.terms = app.filters.terms.slice(0, -1);
    }
  }
</script>

<div
  class="search"
  class:open={focused || !!app.filters.q}
  class:all={showAll}
  class:typing={rows > 0}
  class:overflow={hidden > 0}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="box" onclick={(ev) => ev.target === ev.currentTarget && input?.focus()}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
      ><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      /></svg
    >
    {#if chips.length}
      <!-- One group for the chips, the +N and the clear button (the input sits between them visually). -->
      <div class="active" role="group" aria-label="Active filters">
        <div class="tokens" bind:this={tokensEl}>
          {#each chips as c, i (i + c.text)}
            <button
              type="button"
              class="chip"
              onclick={c.clear}
              aria-label="Remove filter {c.text}"
              title="Remove filter">{c.text} <span aria-hidden="true">×</span></button
            >
          {/each}
        </div>
        {#if hidden}
          <button
            type="button"
            class="more"
            aria-expanded={showAll}
            aria-label="{hidden} more filters"
            onclick={() => (showAll = !showAll)}>+{hidden}</button
          >
        {/if}
        <button
          type="button"
          class="round clear"
          aria-label="Clear all"
          title="Clear all filters"
          onclick={resetFilters}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
            ><path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            /></svg
          >
        </button>
      </div>
    {/if}
    <input
      bind:this={input}
      type="search"
      placeholder="Search events…"
      aria-label="Search events"
      title="Search events, places, organisers (press / to focus)"
      autocomplete="off"
      role="combobox"
      aria-expanded={rows > 0}
      aria-controls="search-suggestions"
      aria-activedescendant={rows ? `sugg-${active}` : undefined}
      bind:value={app.filters.q}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 120)}
      onkeydown={key}
    />
    <button
      type="button"
      class="round funnel"
      class:on={filtersShown}
      aria-label="Filters"
      aria-expanded={filtersShown}
      title={filtersShown ? 'Hide the filters' : 'Show the filters'}
      onclick={toggleFilters}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"
        ><path
          d={FUNNEL}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        /></svg
      >
    </button>
  </div>
  {#if hidden && chips.length}
    <!-- Every chip, unfolded under the box: shown while pointing at the box, or after tapping +N. -->
    <div class="unfold" aria-label="Every active filter" role="group">
      {#each chips as c, i (i + c.text)}
        <button type="button" class="chip" onclick={c.clear} aria-label="Remove filter {c.text}"
          >{c.text} <span aria-hidden="true">×</span></button
        >
      {/each}
    </div>
  {/if}
  {#if rows}
    <ul id="search-suggestions" role="listbox" aria-label="Suggestions">
      {#each list as s, i (s.key + s.value)}
        <li
          id="sugg-{i}"
          role="option"
          aria-selected={active === i}
          class:active={active === i}
          onpointerdown={(ev) => (ev.preventDefault(), pick(s))}
          onpointerenter={() => (active = i)}
        >
          {#if s.key === 'types'}<TypeIcon type={s.value} size={15} />{/if}
          <span class="label">{s.label}</span>
          <span class="group">{s.group} · {s.count}</span>
        </li>
      {/each}
      {#if text}
        <li
          id="sugg-{list.length}"
          role="option"
          aria-selected={active === list.length}
          class="text"
          class:active={active === list.length}
          onpointerdown={(ev) => (ev.preventDefault(), keepText())}
          onpointerenter={() => (active = list.length)}
        >
          <span class="label">Search all text for “{text}”</span>
          <span class="group">Enter</span>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    min-width: 0;
  }
  .box {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 3px 0 14px;
    min-height: 40px;
    color: var(--muted);
    cursor: text;
  }
  .box > svg {
    flex: none;
  }
  .box:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  /* The active filters, in the box. */
  .active {
    display: contents;
  }
  .tokens {
    display: flex;
    gap: 5px;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 62%;
    overflow: hidden;
    mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent);
  }
  .search:not(.overflow) .tokens {
    mask-image: none;
  }
  .chip {
    flex: none;
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 0.8rem;
    font-weight: 600;
    min-height: 28px;
    white-space: nowrap;
  }
  .more {
    flex: none;
    border: 0;
    border-radius: 999px;
    padding: 2px 8px;
    min-height: 28px;
    background: var(--accent);
    color: var(--on-strong, #fff);
    font-size: 0.78rem;
    font-weight: 800;
  }
  /* Round buttons fitted into the box's rounded right end. */
  .round {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .round:hover,
  .round:focus-visible {
    background: var(--accent-soft);
    color: var(--ink);
  }
  .funnel.on {
    color: var(--accent);
  }
  .clear {
    width: 28px;
    height: 28px;
    order: 1;
  }
  input {
    order: 0;
  }
  .funnel {
    order: 2;
  }
  /* All chips, unfolded under the box. */
  .unfold {
    position: absolute;
    z-index: 39;
    top: calc(100% - 2px);
    left: 0;
    right: 0;
    display: none;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 12px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0 0 18px 18px;
    box-shadow: var(--shadow);
  }
  @media (hover: hover) {
    .search:hover:not(.typing) .unfold {
      display: flex;
    }
  }
  .search.all:not(.typing) .unfold,
  .search:not(.typing) .unfold:focus-within {
    display: flex;
  }
  input {
    flex: 1;
    min-width: 110px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    padding: 7px 0;
    font-size: 16px; /* no zoom on iOS */
  }
  ul {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    left: 0;
    width: max(100%, 340px);
    max-width: 92vw;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  li.active {
    background: var(--accent-soft);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group {
    color: var(--muted);
    font-size: 0.78rem;
    white-space: nowrap;
  }
  li.text .label {
    color: var(--muted);
  }
  /* Phones: a round magnifier button until focused; then the box takes the whole row. */
  @media (max-width: 959px) {
    .search:not(.open) .box {
      width: 40px;
      padding: 0;
      justify-content: center;
    }
    /* Closed, it is only the magnifier (the header's Filters button opens the filters). */
    .search:not(.open) .box > :not(svg, input) {
      display: none;
    }
    /* The input still covers the button (invisible), so a tap focuses it and opens the box. */
    .search:not(.open) input {
      position: absolute;
      inset: 0;
      min-width: 0;
      opacity: 0;
    }
  }
</style>
