<script lang="ts">
  import { formatPartial } from '../lib/dates';
  import { FEEDBACK_EMAIL, REPO_URL, issueUrl, mailto } from '../lib/config';
  import type { Ev } from '../lib/model';
  import type { Meta } from '../lib/types';

  let { meta, events }: { meta: Meta; events: Ev[]; today: number } = $props();

  const h = $derived(meta.health);
  const upcoming = $derived(events.filter((e) => !e.isPast && e.status !== 'cancelled'));
  const expected = $derived(upcoming.filter((e) => e.status === 'expected').length);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<article class="about">
  <section>
    <h1>About Quantum Opportunities</h1>
    <p class="lead">
      Quantum hackathons, conferences, schools and programmes on one map and timeline, for students
      and anyone in the quantum community. Started by QIS master’s students in Copenhagen.
    </p>
  </section>

  <section>
    <h2>How to read the data</h2>
    <dl class="legend">
      <dt><span class="badge confirmed">Confirmed</span></dt>
      <dd>An official source announces this edition.</dd>
      <dt><span class="badge expected">Expected · unconfirmed</span></dt>
      <dd>
        Not announced yet. We expect it because the series happens regularly; the dates are
        estimates from past editions. Drawn faint (dimmed) everywhere, with a soft fading bar on the
        timeline.
      </dd>
      <dt><span class="notfound">Not found yet</span></dt>
      <dd>
        We haven’t found this information <em>yet</em>. It does not mean it doesn’t exist, and it
        does not mean “free” or “none”.
      </dd>
      <dt>Faded timeline bars</dt>
      <dd>
        Only the month or year is known, not the exact days. A gradient always means “uncertain”.
      </dd>
    </dl>
    <p>
      Every event lists its sources and the date they were last checked, and links to the full
      history of its data file.
    </p>
  </section>

  <section>
    <h2>Data health</h2>
    <div class="stats">
      <div><b>{upcoming.length}</b><span>upcoming events</span></div>
      <div><b>{expected}</b><span>of them expected, not announced</span></div>
      <div><b>{h.total}</b><span>events in the database</span></div>
    </div>
    <h3>Share of upcoming events where we found…</h3>
    <ul class="bars">
      {#each Object.entries(h.filled) as [field, v] (field)}
        <li>
          <span class="name">{field}</span>
          <span class="track"><span class="fill" style:width={pct(v)}></span></span>
          <span class="mono">{pct(v)}</span>
        </li>
      {/each}
    </ul>
    <p class="muted">
      Last discovery run: {h.lastRuns.scout ? formatPartial(h.lastRuns.scout) : 'not yet'} · last refresh
      run:
      {h.lastRuns.refresher ? formatPartial(h.lastRuns.refresher) : 'not yet'} · data built {formatPartial(
        meta.generatedAt.slice(0, 10),
      )}.
    </p>
  </section>

  <section>
    <h2>How it stays up to date</h2>
    <p>
      The data lives as one small file per event in a public GitHub repository. Scheduled AI agents
      keep it current: a
      <b>Scout</b> looks for new events once a week, and a <b>Refresher</b> re-checks events with missing
      or stale information once or twice a week, starting with those closest in time. Every change is
      checked automatically for format, sources and duplicates before it goes live, and can be undone
      in one click.
    </p>
  </section>

  <section>
    <h2>Help us</h2>
    <ul>
      <li>
        <a href={issueUrl('suggest-event')} target="_blank" rel="noopener">Suggest an event</a> or
        <a href={mailto('New event', 'Event name:\nOfficial link:\n')}>email it to us</a>.
      </li>
      <li>
        Found a mistake? Use “Email a correction” on the event, or
        <a href={issueUrl('correction')} target="_blank" rel="noopener">open a correction issue</a>.
      </li>
      <li>
        Bugs and ideas: <a href={issueUrl('bug')} target="_blank" rel="noopener">open an issue</a>
        or write to
        <a href="mailto:{FEEDBACK_EMAIL}">{FEEDBACK_EMAIL}</a>.
      </li>
      <li>
        Developers: the data and code are on <a href={REPO_URL} target="_blank" rel="noopener"
          >GitHub</a
        >.
      </li>
    </ul>
  </section>

  <section>
    <h2>Licences and credits</h2>
    <p>
      Code: MIT. Data: <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener">CC BY 4.0</a
      >
      — please credit “Quantum Opportunities contributors”. Event descriptions are written by us; facts
      come from the linked sources. Country borders from Natural Earth (public domain). City coordinates
      from GeoNames (CC BY).
    </p>
    <p class="muted">No cookies, no tracking.</p>
  </section>
</article>

<style>
  .about {
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 0 60px;
    display: grid;
    gap: 28px;
  }
  h1 {
    font-size: 1.8rem;
  }
  h2 {
    font-size: 1.15rem;
    margin-bottom: 8px;
  }
  h3 {
    font-size: 0.9rem;
    margin: 14px 0 6px;
    color: var(--muted);
  }
  .lead {
    font-size: 1.08rem;
    color: var(--muted);
  }
  .legend {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 10px 16px;
    align-items: baseline;
  }
  dd {
    margin: 0;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .stats div {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: grid;
  }
  .stats b {
    font-size: 1.6rem;
  }
  .stats span {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .bars {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .bars li {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) 44px;
    gap: 10px;
    align-items: center;
    font-size: 0.88rem;
  }
  .track {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  ul {
    padding-left: 20px;
  }
  @media (max-width: 560px) {
    .legend {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
