<script lang="ts">
  // The essentials shown when a list card unfolds; everything else is one click away in the details pop-up.
  import { formatPartial } from '../lib/dates';
  import { KIND_LABEL, orgName, safeUrl } from '../lib/format';
  import type { Ev } from '../lib/model';
  import { app } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let { e, meta }: { e: Ev; meta: Meta } = $props();

  const organisers = $derived((e.organizers ?? []).map((o) => orgName(meta, o)).join(', '));
  // One link per website.
  const hosts = $derived([
    ...new Map(
      e.sources
        .filter((s) => safeUrl(s.url))
        .map((s) => {
          const host = new URL(s.url).hostname.replace(/^www\./, '');
          return [host, { url: s.url, host }] as const;
        })
        .reverse(),
    ).values(),
  ]);
</script>

<div class="brief">
  {#if e.status === 'expected' && e.expected}
    <p class="banner expected"><b>Expected, not announced yet.</b> Based on: {e.expected.basis}.</p>
  {:else if e.status === 'postponed'}
    <p class="banner warn"><b>Postponed.</b> {e.dates.note ?? 'New dates not announced yet.'}</p>
  {:else if e.status === 'cancelled'}
    <p class="banner warn"><b>Cancelled.</b></p>
  {/if}

  {#if e.description}<p class="desc">{e.description}</p>{/if}
  {#if organisers}<p class="org"><span class="muted">By</span> {organisers}</p>{/if}
  {#if Array.isArray(e.deadlines) && e.deadlines.length}
    <!-- Lit up briefly when one of the event's deadlines is clicked on the timeline. -->
    <p class="dls flashable" class:flash={app.flash?.id === e.id}>
      <span class="muted">Deadlines</span>
      {#each e.deadlines as d (d.kind + d.date)}
        <span class:passed={d.date.length === 10 && Date.parse(d.date) < Date.now()}
          >{KIND_LABEL[d.kind] ?? 'Deadline'} <b>{formatPartial(d.date)}</b></span
        >
      {/each}
    </p>
  {/if}

  <div class="actions">
    {#if safeUrl(e.url)}<a class="btn primary" href={e.url} target="_blank" rel="noopener"
        >Official page ↗</a
      >{/if}
    {#if safeUrl(e.registration_url)}<a
        class="btn"
        href={e.registration_url}
        target="_blank"
        rel="noopener">Register ↗</a
      >{/if}
    <button class="btn" type="button" onclick={() => (app.detailOpen = true)}>More details</button>
  </div>

  <p class="src muted">
    <span>Sources</span>
    {#each hosts as h, i (h.url)}{i ? ', ' : ' '}<a href={h.url} target="_blank" rel="noopener"
        >{h.host}</a
      >{/each} · checked {formatPartial(e.lastChecked)}
  </p>
</div>

<style>
  .dls {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .dls .passed {
    color: var(--muted);
    text-decoration: line-through;
  }
  .brief {
    display: grid;
    gap: 10px;
  }
  p {
    margin: 0;
    font-size: 0.9rem;
  }
  .banner {
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.86rem;
  }
  .banner.expected {
    border: 1.5px dashed var(--expected);
    background: var(--expected-soft);
  }
  .banner.warn {
    background: var(--warn-soft);
  }
  .desc {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .src {
    font-size: 0.8rem;
  }
</style>
