<script lang="ts">
  // Search with suggestions. Typing filters live. Matching filter options are listed below the box (arrows or
  // Tab to move, Enter to pick): picking one sets that filter. Enter on the text itself keeps it as a search
  // term (a chip) and clears the box for the next one; an event must match every term.
  // On phones the box is a magnifier button until it gets focus, then it takes the whole header row.
  import { app } from '../lib/state.svelte';
  import { suggest, type Suggestion } from '../lib/suggest';
  import TypeIcon from './TypeIcon.svelte';

  let { pool }: { pool: Suggestion[] } = $props();

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

<div class="search" class:open={focused || !!app.filters.q}>
  <label>
    <span class="sr-only">Search events</span>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
      ><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      /></svg
    >
    <input
      bind:this={input}
      type="search"
      placeholder="Search events…"
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
  </label>
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
  label {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 14px;
    min-height: 40px;
    color: var(--muted);
    cursor: text;
  }
  label:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  input {
    flex: 1;
    min-width: 0;
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
    .search:not(.open) label {
      width: 40px;
      padding: 0;
      justify-content: center;
    }
    /* The input still covers the button (invisible), so a tap focuses it and opens the box. */
    .search:not(.open) input {
      position: absolute;
      inset: 0;
      opacity: 0;
    }
  }
</style>
