<script lang="ts">
  import EventBrief from './EventBrief.svelte';
  import { daysBetween, formatPartial } from '../lib/dates';
  import { NOT_FOUND, costBadge, costText, statusLabel, whenText, whereText } from '../lib/format';
  import { flag } from '../lib/geo';
  import type { Ev } from '../lib/model';
  import { app, hover, openEvent } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let {
    e,
    meta,
    today,
    dim = false,
    compact = false,
    expandable = true,
  }: {
    e: Ev;
    meta: Meta;
    today: number;
    dim?: boolean;
    compact?: boolean;
    expandable?: boolean;
  } = $props();

  let el: HTMLElement | undefined = $state();
  const hot = $derived(app.hoverId === e.id);
  const open = $derived(expandable && app.eventId === e.id);
  // Selected (clicked) anywhere → scroll to its top. Hovering only highlights, it never scrolls.
  $effect(() => {
    void app.focusTick;
    if (open && el)
      setTimeout(() => el?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
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
  const where = $derived(whereText(e));
</script>

<article
  bind:this={el}
  class="card t-{e.type}"
  class:expected={e.status === 'expected'}
  class:past={e.isPast}
  class:hot
  class:open
  class:compact
  class:dim={dim && !hot && !open}
  onmouseenter={() => hover(e.id)}
  onmouseleave={() => hover(undefined)}
  onfocusin={() => hover(e.id)}
  onfocusout={() => hover(undefined)}
>
  <div class="head">
    <h3>
      <button
        type="button"
        class="name"
        aria-expanded={expandable ? open : undefined}
        onclick={() => (open ? (app.eventId = undefined) : openEvent(e.id, true))}>{e.name}</button
      >
    </h3>
    {#if open}
      <button
        class="collapse"
        type="button"
        onclick={() => (app.eventId = undefined)}
        aria-label="Collapse details"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          ><path
            d="m6 15 6-6 6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          /></svg
        >
      </button>
    {/if}
  </div>
  <div class="meta">
    <span class="type-chip">{typeName}</span>
    {#if statusClass !== 'confirmed'}<span class="badge {statusClass}">{statusLabel(e)}</span>{/if}
    <span class="badge {cb}">{cb === 'unknown' ? 'Cost not found yet' : costText(e)}</span>
  </div>
  <div class="facts">
    <span class="place">
      {#if e.country}<span class="flag" aria-hidden="true">{flag(e.country)}</span
        >{:else if e.format === 'online'}<span class="flag" aria-hidden="true">🌐</span>{/if}
      {#if where === NOT_FOUND}<span class="notfound">Location not found yet</span>{:else}<span
          >{where}</span
        >{/if}
    </span>
    <span class="when">{whenText(e)}</span>
  </div>
  {#if dl && dlDays !== undefined}
    <p class="dl" class:urgent={dlDays <= 14}>
      {dl.kind === 'early_bird' ? 'Early bird' : dl.kind === 'abstract' ? 'Submissions' : 'Apply'} by
      <b>{formatPartial(dl.date)}</b> · {dlDays === 0
        ? 'today'
        : dlDays === 1
          ? 'tomorrow'
          : `${dlDays} days left`}
    </p>
  {:else if e.reg === 'closed' && !e.isPast}
    <p class="dl closed">Applications closed</p>
  {/if}
  {#if topics.length && !compact && !open}
    <div class="topics">
      {#each topics as t (t)}<span class="chip">{t}</span>{/each}
    </div>
  {/if}
  {#if open}
    <div class="more"><EventBrief {e} {meta} /></div>
  {/if}
</article>

<style>
  .card {
    position: relative;
    display: grid;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 5px solid var(--tc);
    border-radius: var(--radius);
    padding: 12px 14px 12px 14px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      opacity 0.15s;
    scroll-margin-top: calc(var(--header-h) + 12px);
  }
  .card.compact {
    scroll-margin-top: 8px;
  }
  .card:hover {
    box-shadow: var(--shadow);
  }
  .card.expected {
    border-style: dashed;
    border-left-style: solid;
    border-left-color: transparent;
    background:
      linear-gradient(var(--surface), var(--surface)) padding-box,
      linear-gradient(
          180deg,
          color-mix(in srgb, var(--tc) 15%, transparent),
          var(--tc) 50%,
          color-mix(in srgb, var(--tc) 15%, transparent)
        )
        border-box;
  }
  .card.past {
    opacity: 0.72;
    filter: grayscale(0.4);
  }
  .card.open {
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--tc) 45%, transparent),
      var(--shadow);
  }
  .card.hot {
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--warn) 55%, transparent),
      var(--shadow);
  }
  .card.dim {
    opacity: 0.38;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: start;
  }
  h3 {
    flex: 1;
    font-size: 1.06rem;
    line-height: 1.3;
  }
  .name {
    all: unset;
    cursor: pointer;
    font-weight: 700;
  }
  .card:not(.open) .name::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
  }
  .name:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .collapse {
    border: 1px solid var(--line);
    background: var(--surface-2);
    border-radius: 8px;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .meta,
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px 12px;
    font-size: 0.9rem;
  }
  .place {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink);
    min-width: 0;
  }
  .flag {
    font-size: 1.55rem;
    line-height: 1;
  }
  .when {
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  p {
    margin: 0;
    font-size: 0.88rem;
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
  .more {
    border-top: 1px solid var(--line);
    margin-top: 6px;
    padding-top: 12px;
  }
  .compact {
    padding: 10px 12px;
  }
  .compact h3 {
    font-size: 0.98rem;
  }
</style>
