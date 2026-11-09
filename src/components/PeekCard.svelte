<script lang="ts">
  // The first, light layer of a selected event, pinned to its place on the map: what it is, when, where, the
  // next deadline, and two ways on (all details; the official page). Used where the list isn't on screen
  // (phones, desktop with the list hidden).
  import { daysBetween, formatPartial, formatRange } from '../lib/dates';
  import { NOT_FOUND, safeUrl, whereText } from '../lib/format';
  import { flag } from '../lib/geo';
  import type { Ev } from '../lib/model';
  import { app, deselect } from '../lib/state.svelte';

  let {
    e,
    today,
    onmore,
  }: {
    e: Ev;
    today: number;
    /** Opens all the details (the list drawer on phones, the pop-up on desktop). */
    onmore: () => void;
  } = $props();

  const where = $derived(whereText(e));
  const dl = $derived(e.nextDeadline);
  const dlDays = $derived(dl ? daysBetween(today, dl.day) : undefined);
</script>

<div class="peek t-{e.type}" role="group" aria-label="{e.name}: summary">
  <div class="top">
    <b class="name">{e.name}</b>
    <button class="icon" type="button" aria-label="Close" title="Close" onclick={deselect}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
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
  <p class="when">{formatRange(e.dates.start, e.dates.end)}</p>
  <p class="where">
    {#if e.country}<span aria-hidden="true">{flag(e.country)}</span
      >{:else if e.format === 'online'}<span aria-hidden="true">🌐</span>{/if}
    {where === NOT_FOUND ? 'Location not found yet' : where}
  </p>
  {#if dl && dlDays !== undefined}
    <p class="dl flashable" class:urgent={dlDays <= 14} class:flash={app.flash?.id === e.id}>
      {dl.kind === 'early_bird' ? 'Early bird' : dl.kind === 'abstract' ? 'Submissions' : 'Apply'} by
      <b>{formatPartial(dl.date)}</b> · {dlDays === 0
        ? 'today'
        : dlDays === 1
          ? 'tomorrow'
          : `${dlDays} days left`}
    </p>
  {/if}
  <div class="actions">
    <button
      class="btn primary"
      type="button"
      onclick={onmore}
      aria-label="All details"
      title="All details"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
        ><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><path
          d="M12 11v6M12 7.5v.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        /></svg
      >
    </button>
    {#if safeUrl(e.url)}
      <a
        class="btn"
        href={e.url}
        target="_blank"
        rel="noopener"
        aria-label="Official page (opens in a new tab)"
        title="Official page"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          ><path
            d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
      </a>
    {/if}
  </div>
</div>

<style>
  .peek {
    width: 260px;
    max-width: calc(100vw - 24px);
    padding: 10px 12px 12px;
    border-radius: 12px;
    border-left: 4px solid var(--tc);
    background: var(--surface);
    box-shadow:
      0 6px 24px rgb(0 0 0 / 25%),
      0 0 0 1px var(--line);
    display: grid;
    gap: 4px;
    animation: peek-in 0.16s ease-out;
  }
  @keyframes peek-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.97);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .peek {
      animation: none;
    }
  }
  .top {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .name {
    flex: 1;
    font-size: 0.95rem;
    line-height: 1.25;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin: -4px -6px 0 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }
  .icon:hover {
    color: var(--ink);
    background: var(--accent-soft);
  }
  p {
    margin: 0;
    font-size: 0.84rem;
  }
  .when {
    color: var(--muted);
  }
  .dl {
    padding: 1px 0;
  }
  .dl.urgent {
    color: var(--danger, var(--hot));
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .actions .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 6px 12px;
  }
</style>
