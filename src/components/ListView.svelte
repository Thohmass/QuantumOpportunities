<script lang="ts">
  import EventCard from './EventCard.svelte';
  import ExpandButton from './ExpandButton.svelte';
  import { monthName } from '../lib/dates';
  import type { SortKey } from '../lib/filters';
  import type { Ev } from '../lib/model';
  import { app, resetFilters } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let {
    events,
    meta,
    today,
    dimmed = new Set<string>(),
    compact = false,
    expandable = true,
    panel = false,
  }: {
    events: Ev[];
    meta: Meta;
    today: number;
    dimmed?: Set<string>;
    compact?: boolean;
    expandable?: boolean;
    /** Show the expand/shrink button (Explore panel or expanded list). */
    panel?: boolean;
  } = $props();

  const PAGE = 60;
  let limit = $state(PAGE);
  $effect(() => {
    void events;
    limit = PAGE; // new results start from the top
  });

  // A selected event further down the list is always rendered (so its card can unfold).
  $effect(() => {
    const i = app.eventId ? events.findIndex((e) => e.id === app.eventId) : -1;
    if (i >= limit) limit = i + 10;
  });

  const groups = $derived.by(() => {
    const shown = events.slice(0, limit);
    if (app.filters.sort !== 'date') return [{ key: 'all', title: '', items: shown }];
    const out: { key: string; title: string; items: Ev[] }[] = [];
    for (const e of shown) {
      const d = new Date(e.isPast ? e.span[0] : e.keyDay);
      const key = e.isPast ? 'past' : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      const title = e.isPast
        ? 'Past events'
        : `${monthName(d.getUTCMonth(), true)} ${d.getUTCFullYear()}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(e);
      else out.push({ key, title, items: [e] });
    }
    return out;
  });

  const sorts: [SortKey, string][] = [
    ['date', 'Next date'],
    ['start', 'Start date'],
    ['added', 'Recently added'],
    ['updated', 'Recently checked'],
  ];
</script>

<section class="list" class:compact class:columns={panel && !compact} aria-label="Events">
  <div class="toolbar">
    <!-- The number of events is shown once, in the header. -->
    <label>
      <span class="muted">Sort</span>
      <select bind:value={app.filters.sort}>
        {#each sorts as [id, label] (id)}<option value={id}>{label}</option>{/each}
      </select>
    </label>
    {#if panel}<ExpandButton panel="list" label="list" />{/if}
  </div>

  {#if !events.length}
    <div class="empty">
      <p>No events match these filters.</p>
      <button class="btn" type="button" onclick={resetFilters}>Clear filters</button>
    </div>
  {/if}

  {#each groups as g (g.key)}
    {#if g.title}<h2 class="group">{g.title}</h2>{/if}
    <div class="cards">
      {#each g.items as e (e.id)}
        <EventCard {e} {meta} {today} dim={dimmed.has(e.id)} {compact} {expandable} />
      {/each}
    </div>
  {/each}

  {#if events.length > limit}
    <button class="btn more" type="button" onclick={() => (limit += PAGE)}
      >Show {Math.min(PAGE, events.length - limit)} more</button
    >
  {/if}
</section>

<style>
  /* Named for the expand/shrink animation (view transitions). */
  .list {
    view-transition-name: qo-list;
  }
  .list {
    display: grid;
    gap: 10px;
    padding-bottom: 40px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .toolbar label {
    margin-left: auto;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.88rem;
  }
  select {
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 8px;
    padding: 5px 8px;
    min-height: 36px;
  }
  .group {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-top: 14px;
  }
  .cards {
    display: grid;
    gap: 10px;
  }
  /* The expanded list on a wide screen: 2–3 columns, so cards keep a natural width. */
  .list.columns .cards {
    grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
    align-items: start;
  }
  .empty {
    text-align: center;
    padding: 40px 10px;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    color: var(--muted);
  }
  .more {
    justify-self: center;
  }
  .list.compact {
    padding-bottom: 16px;
  }
  /* The expanded list runs edge to edge; its cards keep a small margin from the window. */
  .list.columns {
    padding-inline: 10px;
  }
</style>
