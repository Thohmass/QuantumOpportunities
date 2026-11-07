<script lang="ts">
  import { daysBetween, formatPartial } from '../lib/dates';
  import {
    NOT_FOUND,
    costBadge,
    costText,
    flagOf,
    statusLabel,
    whenText,
    whereText,
  } from '../lib/format';
  import type { Ev } from '../lib/model';
  import { app, hover, openEvent } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let {
    e,
    meta,
    today,
    dim = false,
    compact = false,
  }: { e: Ev; meta: Meta; today: number; dim?: boolean; compact?: boolean } = $props();
  let el: HTMLElement | undefined = $state();
  const hot = $derived(app.hoverId === e.id);
  // When the event is hovered in another view (map, timeline), bring its card into view.
  $effect(() => {
    if (hot && el && !el.matches(':hover'))
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const typeName = $derived(meta.types.find((t) => t.id === e.type)?.name ?? e.type);
  const statusClass = $derived(
    e.status === 'confirmed'
      ? e.isOngoing
        ? 'ongoing'
        : e.isPast
          ? 'past'
          : 'confirmed'
      : e.status,
  );
  const dl = $derived(e.nextDeadline);
  const dlDays = $derived(dl ? daysBetween(today, dl.day) : undefined);
  const topics = $derived(
    (e.topics ?? []).slice(0, 3).map((id) => meta.topics.find((t) => t.id === id)?.name ?? id),
  );
  const cb = $derived(costBadge(e));
</script>

<article
  bind:this={el}
  class="card"
  class:expected={e.status === 'expected'}
  class:past={e.isPast}
  class:hot
  class:compact
  class:dim={dim && !hot}
  onmouseenter={() => hover(e.id)}
  onmouseleave={() => hover(undefined)}
  onfocusin={() => hover(e.id)}
  onfocusout={() => hover(undefined)}
>
  <div class="when">
    <span class="month">{formatPartial(e.dates.start.slice(0, 7))}</span>
    <span class="range">{whenText(e)}</span>
  </div>
  <div class="body">
    <h3>
      <button type="button" class="open" onclick={() => openEvent(e.id)}>{e.name}</button>
    </h3>
    <div class="meta">
      <span class="badge {statusClass}">{statusLabel(e)}</span>
      <span class="chip">{typeName}</span>
      <span class="badge {cb}" title="Cost"
        >{cb === 'unknown' ? 'Cost not found yet' : costText(e)}</span
      >
    </div>
    <p class="where">
      {#if whereText(e) === NOT_FOUND}<span class="notfound">Location not found yet</span>
      {:else}<span aria-hidden="true">{flagOf(e)}</span> {whereText(e)}{/if}
    </p>
    {#if dl && dlDays !== undefined}
      <p class="dl" class:urgent={dlDays <= 14}>
        {dl.kind === 'early_bird' ? 'Early bird' : dl.kind === 'abstract' ? 'Submissions' : 'Apply'} by
        <b>{formatPartial(dl.date)}</b>
        <span class="mono"
          >· {dlDays === 0 ? 'today' : dlDays === 1 ? 'tomorrow' : `${dlDays} days`}</span
        >
      </p>
    {:else if e.reg === 'closed' && !e.isPast}
      <p class="dl closed">Applications closed</p>
    {/if}
    {#if topics.length && !compact}
      <div class="topics">
        {#each topics as t (t)}<span class="chip">{t}</span>{/each}
      </div>
    {/if}
  </div>
</article>

<style>
  .card {
    position: relative;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px 16px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow);
  }
  .card.expected {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--expected) 55%, var(--line));
  }
  .card.past {
    opacity: 0.7;
  }
  .card.hot {
    border-color: var(--warn);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--warn) 35%, transparent),
      var(--shadow);
  }
  .card.dim {
    opacity: 0.38;
  }
  .when {
    display: grid;
    align-content: start;
    gap: 2px;
  }
  .month {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }
  .range {
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1.25;
  }
  .body {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  h3 {
    font-size: 1.05rem;
  }
  .open {
    all: unset;
    cursor: pointer;
    font-weight: 700;
  }
  .open::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
  }
  .open:focus-visible::after {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .meta,
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  p {
    margin: 0;
    font-size: 0.9rem;
  }
  .where {
    color: var(--muted);
  }
  .dl {
    color: var(--accent);
  }
  .dl.urgent {
    color: var(--warn);
  }
  .dl.closed {
    color: var(--muted);
  }
  .card.compact {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding: 10px 12px;
  }
  .card.compact .when {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .card.compact .month {
    display: none;
  }
  .card.compact h3 {
    font-size: 0.98rem;
  }
  @media (max-width: 560px) {
    .card {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .when {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .month {
      display: none;
    }
  }
</style>
