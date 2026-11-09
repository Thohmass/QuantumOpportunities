<script lang="ts">
  import EventBrief from './EventBrief.svelte';
  import { daysBetween, formatPartial } from '../lib/dates';
  import { NOT_FOUND, statusLabel, whenText, whereText } from '../lib/format';
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
  // Selected (clicked) anywhere → scroll only as much as needed to show the whole card: not at all if it is
  // already fully visible, down until it is the last card shown, or up until it is the first. A card taller
  // than the box is shown from its top. Hovering never scrolls.
  $effect(() => {
    void app.focusTick;
    if (open && el)
      setTimeout(() => {
        if (!el) return;
        const box = el.closest<HTMLElement>('.list-drawer, .list-pane');
        if (!box || getComputedStyle(box).overflowY === 'visible')
          return el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const b = box.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const pad = 8;
        let delta = 0;
        if (r.height > b.height - 2 * pad || r.top < b.top + pad) delta = r.top - b.top - pad;
        else if (r.bottom > b.bottom - pad) delta = r.bottom - b.bottom + pad;
        if (delta) box.scrollBy({ top: delta, behavior: 'smooth' });
      }, 50);
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
  onpointerenter={(ev) => ev.pointerType === 'mouse' && hover(e.id)}
  onpointerleave={() => hover(undefined)}
  onfocusin={(ev) => (ev.target as Element).matches(':focus-visible') && hover(e.id)}
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
  <!-- The colour edge names the type, quietly: bold capitals in a shade of the edge itself. -->
  <span class="stripe" aria-hidden="true" style:--chars={typeName.length}
    ><span>{typeName}</span></span
  >
  <span class="sr-only">{typeName}{statusClass === 'expected' ? ', expected' : ''}</span>
  {#if statusClass !== 'confirmed' && statusClass !== 'expected'}
    <div class="meta"><span class="badge {statusClass}">{statusLabel(e)}</span></div>
  {/if}
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
    <p
      class="dl flashable"
      class:urgent={dlDays <= 14}
      class:flash={app.flash?.id === e.id && !open}
    >
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
    border-radius: var(--radius);
    padding: 12px 14px 12px 36px;
    overflow: hidden;
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
  /* The type's colour edge, wide enough to carry its name, read from bottom to top. */
  .stripe {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    container-type: size;
    background: var(--tc);
    /* A thin darker line keeps white and yellow edges visible. */
    box-shadow: inset -1px 0 0 var(--tc-edge);
  }
  .stripe span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    /* Shrinks to fit a short card's height. */
    font-size: min(0.64rem, calc(92cqh / (var(--chars) * 0.95)));
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--tc-on) 42%, var(--tc));
  }
  .card.expected {
    border-style: dashed;
  }
  /* Uncertain = a fading edge (expected editions). */
  .card.expected .stripe {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--tc) 18%, transparent),
      var(--tc) 50%,
      color-mix(in srgb, var(--tc) 18%, transparent)
    );
  }
  .card.past {
    opacity: 0.72;
    filter: grayscale(0.4);
  }
  /* One highlight for "this event", the same in every view: selected = orange ring; pointed at = a lighter one. */
  .card.hot {
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--hot) 55%, transparent),
      var(--shadow);
  }
  .card.open {
    box-shadow:
      0 0 0 2px var(--hot),
      var(--shadow);
  }
  /* Dimmed = uncertain (expected editions). */
  .card.dim {
    opacity: 0.6;
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
    padding: 10px 12px 10px 34px;
  }
  .compact h3 {
    font-size: 0.98rem;
  }
</style>
