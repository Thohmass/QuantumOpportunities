<script lang="ts">
  import { formatPartial, formatRange } from '../lib/dates';
  import { REPO_URL, issueUrl, mailto } from '../lib/config';
  import {
    FORMAT_LABEL,
    KIND_LABEL,
    NOT_FOUND,
    costText,
    flagOf,
    orgName,
    safeUrl,
    statusLabel,
    teamText,
    whereText,
  } from '../lib/format';
  import { canExportIcs, eventIcs } from '../lib/ics';
  import type { Ev } from '../lib/model';
  import { app } from '../lib/state.svelte';
  import EventInfo from './EventInfo.svelte';
  import type { Meta } from '../lib/types';
  import TypeIcon from './TypeIcon.svelte';

  let {
    e,
    meta,
    today,
    popup = false,
    onclose,
  }: {
    e: Ev;
    meta: Meta;
    today: number;
    /** Centred pop-up (opened from a list card) instead of the side panel. */
    popup?: boolean;
    onclose: () => void;
  } = $props();

  let closeBtn: HTMLButtonElement | undefined = $state();
  let copied = $state(false);
  $effect(() => {
    void e.id;
    closeBtn?.focus();
    copied = false;
  });

  const close = () => onclose();
  const statusClass = $derived(
    e.status === 'confirmed'
      ? e.isOngoing
        ? 'ongoing'
        : e.isPast
          ? 'past'
          : 'confirmed'
      : e.status,
  );
  const typeName = $derived(meta.types.find((t) => t.id === e.type)?.name ?? e.type);
  const topicNames = $derived(
    (e.topics ?? []).map((id) => meta.topics.find((t) => t.id === id)?.name ?? id),
  );
  const audienceNames = $derived(
    Array.isArray(e.audience)
      ? e.audience.map((id) => meta.audiences.find((a) => a.id === id)?.name ?? id)
      : [],
  );
  const pageUrl = $derived(
    `${location.origin}${location.pathname}#/${app.view === 'about' ? 'list' : app.view}?e=${e.id}`,
  );
  const fileUrl = $derived(
    `${REPO_URL}/blob/main/data/events/${e.dates.start.slice(0, 4)}/${e.id}.yaml`,
  );
  const historyUrl = $derived(
    `${REPO_URL}/commits/main/data/events/${e.dates.start.slice(0, 4)}/${e.id}.yaml`,
  );
  const team = $derived(teamText(e));
  const needsTeam = $derived(['hackathon', 'challenge'].includes(e.type));

  function downloadIcs() {
    const blob = new Blob([eventIcs(e, pageUrl)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${e.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<svelte:window onkeydown={(ev) => ev.key === 'Escape' && close()} />

<div class="backdrop" class:popup onclick={close} aria-hidden="true"></div>
<div class="detail" class:popup role="dialog" aria-modal="true" aria-labelledby="detail-title">
  <div class="top">
    <div class="badges">
      <span class="badge {statusClass}">{statusLabel(e)}</span>
      <span class="type-chip t-{e.type}"><TypeIcon type={e.type} />{typeName}</span>
    </div>
    <button
      bind:this={closeBtn}
      class="btn ghost close"
      type="button"
      onclick={close}
      aria-label="Close details">✕</button
    >
  </div>

  <h2 id="detail-title">{e.name}</h2>
  <p class="lead">
    <b>{formatRange(e.dates.start, e.dates.end)}</b> · <span aria-hidden="true">{flagOf(e)}</span>
    {whereText(e)}
  </p>

  <EventInfo {e} {meta} {today} />
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 35%);
    z-index: 40;
  }
  .detail {
    position: fixed;
    z-index: 50;
    background: var(--surface);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px 20px max(28px, env(safe-area-inset-bottom));
    display: grid;
    align-content: start;
    gap: 14px;
    box-shadow: var(--shadow);
    /* mobile: bottom sheet */
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 88dvh;
    border-radius: 16px 16px 0 0;
    animation: up 0.18s ease-out;
  }
  @keyframes up {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (min-width: 900px) {
    .backdrop {
      background: rgb(0 0 0 / 15%);
    }
    .detail {
      top: 0;
      left: auto;
      width: min(480px, 92vw);
      max-height: none;
      border-radius: 0;
      border-left: 1px solid var(--line);
      animation: none;
    }
  }
  @media (min-width: 900px) {
    .backdrop.popup {
      background: rgb(0 0 0 / 40%);
    }
    .detail.popup {
      top: 50%;
      left: 50%;
      bottom: auto;
      transform: translate(-50%, -50%);
      width: min(640px, 92vw);
      max-height: 86dvh;
      border: 1px solid var(--line);
      border-radius: 14px;
    }
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: -16px;
    background: var(--surface);
    padding: 4px 0;
  }
  .badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .close {
    font-size: 1.1rem;
    min-width: 44px;
  }
  h2 {
    font-size: 1.4rem;
  }
  .lead {
    margin: 0;
  }
</style>
