<script lang="ts">
  import Facet, { type Option } from './Facet.svelte';
  import Section from './Section.svelte';
  import { bounds, isoDay } from '../lib/dates';
  import type { FacetKey } from '../lib/filters';
  import { FORMAT_LABEL, ORG_TYPE_LABEL } from '../lib/format';
  import { CONTINENT_NAMES, countryName, flag } from '../lib/geo';
  import { toIntervals } from '../lib/ranges';
  import { app, resetFilters, setRanges, toggleIn } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let {
    meta,
    counts,
    universe,
    shown,
    onclose,
  }: {
    meta: Meta;
    counts: Record<FacetKey, Map<string, number>>;
    universe: Record<FacetKey, Set<string>>;
    shown: number;
    /** The arrow in the top-right corner: hides the sidebar (closes the drawer on phones). */
    onclose?: () => void;
  } = $props();

  const f = $derived(app.filters);
  const toggle = (key: FacetKey) => (v: string) =>
    (app.filters[key] = toggleIn(app.filters[key], v));
  const n = (key: FacetKey, v: string) => counts[key].get(v) ?? 0;

  /** Options in a fixed order: every value that exists in the database, plus anything selected. */
  function fixed(
    key: FacetKey,
    order: { value: string; label: string; depth?: number; swatch?: string; icon?: string }[],
  ): Option[] {
    const known = new Set([...universe[key], ...f[key]]);
    return order.filter((o) => known.has(o.value)).map((o) => ({ ...o, count: n(key, o.value) }));
  }
  function alphabetical(key: FacetKey, label: (v: string) => string): Option[] {
    return [...new Set([...universe[key], ...f[key]])]
      .map((v) => ({ value: v, label: label(v), count: n(key, v) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const topicOrder = $derived.by(() => {
    const depth = (id: string): number => {
      const t = meta.topics.find((x) => x.id === id);
      return t?.parent ? 1 + depth(t.parent) : 0;
    };
    // Topics count events tagged with any descendant, so keep a parent if any descendant is used.
    const used = (id: string): boolean =>
      universe.topics.has(id) || meta.topics.some((t) => t.parent === id && used(t.id));
    return meta.topics
      .filter((t) => used(t.id) || f.topics.includes(t.id))
      .map((t) => ({ value: t.id, label: t.name, depth: depth(t.id), count: n('topics', t.id) }));
  });

  const CONTINENT_ORDER = ['EU', 'NA', 'AS', 'OC', 'SA', 'AF', 'AN', 'online'];

  // "Pick dates": edits a single period; several periods come from the timeline.
  const intervals = $derived(toIntervals(f.ranges));
  const span = $derived(
    intervals.length
      ? [isoDay(intervals[0]![0]), isoDay(intervals[intervals.length - 1]![1])]
      : ['', ''],
  );
  function setSpan(from: string, to: string) {
    if (!from && !to) return setRanges([]);
    const a = from || to;
    const b = to || from;
    setRanges([[bounds(a)[0], bounds(b)[1]]]);
  }

  const presets: { id: typeof f.when; label: string }[] = [
    { id: 'any', label: 'Any time' },
    { id: '30d', label: 'Next 30 days' },
    { id: '3m', label: 'Next 3 months' },
    { id: 'thisyear', label: 'This year' },
    { id: 'nextyear', label: 'Next year' },
    { id: 'custom', label: 'Pick dates' },
  ];
  const showCount = $derived(
    Number(!f.showExpected) + Number(f.showPast) + Number(f.showCancelled),
  );
</script>

<div class="panel" id="filters">
  <div class="head">
    <h2>Filters</h2>
    <button class="btn ghost clear-all" type="button" onclick={resetFilters}>Clear all</button>
    {#if onclose}
      <button
        class="hide"
        type="button"
        aria-label="Hide filters"
        title="Hide filters"
        onclick={onclose}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          ><path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
      </button>
    {/if}
  </div>

  <Section title="When" open active={f.when === 'any' ? 0 : 1}>
    <div class="pills">
      {#each presets as p (p.id)}
        <button
          type="button"
          class:on={f.when === p.id}
          aria-pressed={f.when === p.id}
          onclick={() => (app.filters.when = p.id)}>{p.label}</button
        >
      {/each}
    </div>
    {#if f.when === 'custom'}
      <div class="range">
        <label
          >From <input
            type="date"
            value={span[0]}
            onchange={(ev) => setSpan(ev.currentTarget.value, span[1]!)}
          /></label
        >
        <label
          >To <input
            type="date"
            value={span[1]}
            onchange={(ev) => setSpan(span[0]!, ev.currentTarget.value)}
          /></label
        >
      </div>
      {#if intervals.length > 1}<p class="note">
          {intervals.length} separate periods selected on the timeline.
        </p>{/if}
      <p class="note">
        Tip: click months or days on the timeline; Shift-click selects a range, Ctrl/Cmd-click adds
        one.
      </p>
    {/if}
    {#if f.when !== 'any'}
      <label class="check"
        ><input type="checkbox" bind:checked={app.filters.byDeadline} /> Also match deadlines in this
        period</label
      >
    {/if}
  </Section>

  <Section title="Applications" open active={f.deadline === 'any' ? 0 : 1}>
    <div class="pills">
      {#each [['any', 'Any'], ['open', 'Open now'], ['2w', 'Closing within 2 weeks']] as [id, label] (id)}
        <button
          type="button"
          class:on={f.deadline === id}
          aria-pressed={f.deadline === id}
          onclick={() => (app.filters.deadline = id as typeof f.deadline)}>{label}</button
        >
      {/each}
    </div>
  </Section>

  <Section title="Show" open active={showCount}>
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showExpected} /> Expected (unconfirmed) editions</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showPast} /> Past events</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showCancelled} /> Cancelled events</label
    >
  </Section>

  <Facet
    title="Event type"
    options={fixed(
      'types',
      meta.types.map((t) => ({ value: t.id, label: t.name, icon: t.id })),
    )}
    selected={f.types}
    onToggle={toggle('types')}
    limit={12}
  />
  <Facet
    title="Topic"
    options={topicOrder}
    selected={f.topics}
    onToggle={toggle('topics')}
    limit={12}
  />
  <Facet
    title="Format"
    options={fixed(
      'formats',
      Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label })),
    )}
    selected={f.formats}
    onToggle={toggle('formats')}
  />
  <Facet
    title="Continent"
    options={fixed(
      'continents',
      CONTINENT_ORDER.map((c) => ({
        value: c,
        label: c === 'online' ? 'Online only' : CONTINENT_NAMES[c as keyof typeof CONTINENT_NAMES],
      })),
    )}
    selected={f.continents}
    onToggle={toggle('continents')}
  />
  <Facet
    title="Country"
    options={alphabetical('countries', (v) => `${flag(v)} ${countryName(v)}`)}
    selected={f.countries}
    onToggle={toggle('countries')}
    searchable
  />
  <Facet
    title="City"
    options={alphabetical('cities', (v) => {
      const [city, cc] = v.split('|');
      return `${city}, ${cc}`;
    })}
    selected={f.cities}
    onToggle={toggle('cities')}
    searchable
    limit={6}
  />
  <Facet
    title="Organiser type"
    options={fixed(
      'orgTypes',
      Object.entries(ORG_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    )}
    selected={f.orgTypes}
    onToggle={toggle('orgTypes')}
  />
  <Facet
    title="Organiser"
    options={alphabetical('orgs', (v) => meta.orgs[v]?.name ?? v)}
    selected={f.orgs}
    onToggle={toggle('orgs')}
    searchable
    limit={6}
  />

  <Section title="Cost & support" active={f.cost.length + Number(f.travel) + Number(f.realQpu)}>
    {#each [['free', 'Free'], ['paid', 'Paid'], ['unknown', 'Not found yet']] as [v, label] (v)}
      <label class="check" class:zero={n('cost', v!) === 0 && !f.cost.includes(v!)}>
        <input type="checkbox" checked={f.cost.includes(v!)} onchange={() => toggle('cost')(v!)} />
        <span class="grow">{label}</span><span class="n">{n('cost', v!)}</span>
      </label>
    {/each}
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.travel} /> Travel support or grants available</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.realQpu} /> Access to real quantum hardware</label
    >
  </Section>

  <Facet
    title="Audience"
    options={fixed('audience', [
      ...meta.audiences.map((a) => ({ value: a.id, label: a.name })),
      { value: 'unknown', label: 'Not found yet' },
    ])}
    selected={f.audience}
    onToggle={toggle('audience')}
  />

  <div class="done">
    <button class="btn primary" type="button" onclick={() => (app.filtersOpen = false)}
      >Show {shown} events</button
    >
  </div>
</div>

<style>
  .panel {
    display: grid;
    gap: 18px;
    padding: 16px 16px 24px;
  }
  /* Title left, Clear all in the middle, the hide arrow in the top-right corner. */
  .head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .clear-all {
    justify-self: center;
  }
  .hide {
    justify-self: end;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .hide:hover,
  .hide:focus-visible {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--line);
  }
  h2 {
    font-size: 1.05rem;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pills button {
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 0.85rem;
    min-height: 34px;
  }
  .pills button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .range {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .range label {
    display: grid;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .range input {
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 8px;
    padding: 5px 8px;
    font-size: 16px;
  }
  .note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 2px 6px;
    font-size: 0.92rem;
    cursor: pointer;
  }
  .check.zero {
    opacity: 0.42;
  }
  .check input {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
  }
  .grow {
    flex: 1;
  }
  .n {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--muted);
  }
  .done {
    position: sticky;
    bottom: 0;
    padding-top: 8px;
    background: linear-gradient(transparent, var(--surface) 30%);
  }
  .done .btn {
    width: 100%;
  }
  @media (min-width: 960px) {
    .done {
      display: none;
    }
  }
</style>
