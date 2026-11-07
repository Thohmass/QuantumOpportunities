<script lang="ts">
  // Event facts, actions and sources: shared by the side panel and the expanded list card.
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
  import type { Meta } from '../lib/types';

  let { e, meta, today }: { e: Ev; meta: Meta; today: number } = $props();

  let copied = $state(false);
  $effect(() => {
    void e.id;
    copied = false;
  });
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

<div class="info">
  {#if e.status === 'expected' && e.expected}
    <div class="banner expected">
      <b>Expected, not announced yet.</b> Based on: {e.expected.basis}. Confidence: {e.expected
        .confidence}.
    </div>
  {:else if e.status === 'postponed'}
    <div class="banner warn">
      <b>Postponed.</b>
      {e.dates.note ?? 'New dates not announced yet.'}
    </div>
  {:else if e.status === 'cancelled'}
    <div class="banner warn"><b>Cancelled.</b></div>
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
    {#if canExportIcs(e)}<button class="btn" type="button" onclick={downloadIcs}
        >Add to calendar</button
      >{/if}
    <button class="btn" type="button" onclick={copyLink}
      >{copied ? 'Link copied' : 'Copy link'}</button
    >
  </div>

  {#if e.description}<p class="desc">{e.description}</p>{/if}

  <dl>
    <dt>Dates</dt>
    <dd>
      {formatRange(e.dates.start, e.dates.end)}
      {#if e.dates.start.length < 10}<span class="muted"> (exact days not found yet)</span>{/if}
      {#if e.dates.note}<div class="muted">{e.dates.note}</div>{/if}
    </dd>

    <dt>Deadlines</dt>
    <dd>
      {#if e.deadlines === 'n/a'}No application or registration deadline
      {:else if Array.isArray(e.deadlines)}
        <ul>
          {#each e.deadlines as d (d.kind + d.date)}
            <li class:passed={d.date.length === 10 && Date.parse(d.date) < today}>
              {KIND_LABEL[d.kind]}: <b>{formatPartial(d.date)}</b>{#if d.note}<span class="muted">
                  · {d.note}</span
                >{/if}
            </li>
          {/each}
        </ul>
      {:else}<span class="notfound">{NOT_FOUND}</span>{/if}
    </dd>

    <dt>Where</dt>
    <dd>
      {#if e.format === 'online'}Online
      {:else if e.city}
        {[e.venue, e.city].filter(Boolean).join(', ')}, {e.country}
        <span class="muted">({FORMAT_LABEL[e.format]})</span>
      {:else}<span class="notfound">{NOT_FOUND}</span>
        <span class="muted">({FORMAT_LABEL[e.format]})</span>{/if}
    </dd>

    <dt>Cost</dt>
    <dd>
      <span class:notfound={!e.cost}>{costText(e)}</span>{#if e.cost?.note}<span class="muted">
          {' · ' + e.cost.note}</span
        >{/if}
    </dd>

    <dt>Travel support</dt>
    <dd>
      {#if e.support === 'n/a'}Not applicable
      {:else if e.support}{e.support.travel_grants ? 'Yes' : 'No'}{#if e.support.note}<span
            class="muted"
          >
            {' · ' + e.support.note}</span
          >{/if}
      {:else}<span class="notfound">{NOT_FOUND}</span>{/if}
    </dd>

    {#if needsTeam || (e.team && e.team !== 'n/a')}
      <dt>Teams</dt>
      <dd><span class:notfound={team === NOT_FOUND}>{team}</span></dd>
    {/if}

    {#if e.hardware !== 'n/a' && (e.hardware || ['hackathon', 'challenge'].includes(e.type))}
      <dt>Quantum hardware</dt>
      <dd>
        {#if e.hardware}{e.hardware.real_qpu
            ? 'Real quantum hardware'
            : 'Simulators / no hardware'}{#if e.hardware.note}<span class="muted">
              {' · ' + e.hardware.note}</span
            >{/if}
        {:else}<span class="notfound">{NOT_FOUND}</span>{/if}
      </dd>
    {/if}

    {#if e.prizes && e.prizes !== 'n/a'}<dt>Prizes</dt>
      <dd>{e.prizes}</dd>{/if}

    <dt>Who it's for</dt>
    <dd>
      {#if audienceNames.length}{audienceNames.join(
          ', ',
        )}{:else if e.audience === 'n/a'}Anyone{:else}<span class="notfound">{NOT_FOUND}</span>{/if}
      {#if e.eligibility}<div class="muted">{e.eligibility}</div>{/if}
    </dd>

    <dt>Organisers</dt>
    <dd>
      {#if e.organizers?.length}{e.organizers.map((o) => orgName(meta, o)).join(', ')}{:else}<span
          class="notfound">{NOT_FOUND}</span
        >{/if}
      {#if e.partners?.length}<div class="muted">
          With {e.partners.map((o) => orgName(meta, o)).join(', ')}
        </div>{/if}
    </dd>

    {#if topicNames.length}<dt>Topics</dt>
      <dd>{topicNames.join(', ')}</dd>{/if}
    {#if e.series && meta.series[e.series]}<dt>Series</dt>
      <dd>{meta.series[e.series]!.name}</dd>{/if}
  </dl>

  {#if e.missing.length}
    <p class="missing">
      <b>Not found yet:</b>
      {e.missing.join(', ')}. That means our agents haven't found it, not that it doesn't exist.
      Know it?
      <a href={mailto(`Update: ${e.id}`, `Event: ${e.name}\nWhat I know:\nSource (link):\n`)}
        >Tell us</a
      >.
    </p>
  {/if}

  <section class="sources">
    <h3>Sources</h3>
    <ul>
      {#each e.sources as s (s.url)}
        <li>
          {#if safeUrl(s.url)}<a href={s.url} target="_blank" rel="noopener"
              >{new URL(s.url).hostname.replace(/^www\./, '')}</a
            >{/if}
          <span class="muted"
            >· {s.kind.replace('_', ' ')} · checked {formatPartial(s.accessed)}{#if s.note}
              · {s.note}{/if}</span
          >
        </li>
      {/each}
    </ul>
    <p class="muted small">
      Last checked {formatPartial(e.lastChecked)} · added {formatPartial(e.addedOn)} ·
      <a href={historyUrl} target="_blank" rel="noopener">see all changes</a> ·
      <a href={fileUrl} target="_blank" rel="noopener">data file</a>
    </p>
    <p class="small">
      Something wrong? <a
        href={mailto(
          `Correction: ${e.id}`,
          `Event: ${e.name}\nWhat is wrong:\nCorrect information + source link:\n`,
        )}>Email a correction</a
      >
      or
      <a href={issueUrl('correction', `Correction: ${e.id}`)} target="_blank" rel="noopener"
        >open an issue</a
      >.
    </p>
  </section>
</div>

<style>
  .info {
    display: grid;
    gap: 14px;
  }
  .banner {
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.9rem;
  }
  .banner.expected {
    border: 1.5px dashed var(--expected);
    background: var(--expected-soft);
  }
  .banner.warn {
    background: var(--warn-soft);
    color: var(--ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .desc {
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 8px 14px;
    margin: 0;
    font-size: 0.92rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  dd ul,
  .sources ul {
    margin: 0;
    padding-left: 18px;
  }
  li.passed {
    color: var(--muted);
    text-decoration: line-through;
  }
  .missing {
    margin: 0;
    font-size: 0.88rem;
    background: var(--surface-2);
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .sources {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }
  h3 {
    font-size: 0.95rem;
  }
  .sources li {
    font-size: 0.88rem;
  }
  .small {
    font-size: 0.84rem;
    margin: 0;
  }
  @media (max-width: 480px) {
    dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    dd {
      margin-bottom: 8px;
    }
  }
</style>
