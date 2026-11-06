<script lang="ts">
  import Facet, { type Option } from './Facet.svelte';
  import { bounds, isoDay } from '../lib/dates';
  import type { FacetKey } from '../lib/filters';
  import { FORMAT_LABEL, ORG_TYPE_LABEL } from '../lib/format';
  import { CONTINENT_NAMES, countryName, flag } from '../lib/geo';
  import { app, resetFilters, toggleIn } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';

  let {
    meta,
    counts,
    shown,
  }: { meta: Meta; counts: Record<FacetKey, Map<string, number>>; shown: number } = $props();

  const f = $derived(app.filters);
  const toggle = (key: FacetKey) => (v: string) =>
    (app.filters[key] = toggleIn(app.filters[key], v));
  const n = (key: FacetKey, v: string) => counts[key].get(v) ?? 0;

  /** Options from a known list, plus any selected value so it can be unticked. */
  function opts(
    key: FacetKey,
    list: { value: string; label: string; depth?: number }[],
    hideZero = false,
  ): Option[] {
    return list
      .map((o) => ({ ...o, count: n(key, o.value) }))
      .filter((o) => !hideZero || o.count > 0 || f[key].includes(o.value));
  }
  /** Options from whatever values the counts contain, sorted by count. */
  function dynamic(key: FacetKey, label: (v: string) => string): Option[] {
    const values = new Set([...counts[key].keys(), ...f[key]]);
    return [...values]
      .map((v) => ({ value: v, label: label(v), count: n(key, v) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  const topicOptions = $derived.by(() => {
    const depth = (id: string): number => {
      const t = meta.topics.find((x) => x.id === id);
      return t?.parent ? 1 + depth(t.parent) : 0;
    };
    return opts(
      'topics',
      meta.topics.map((t) => ({ value: t.id, label: t.name, depth: depth(t.id) })),
      true,
    );
  });

  /** Date inputs need full dates; a month from an old link becomes its first or last day. */
  function full(d: string, edge: 'start' | 'end'): string {
    if (!d) return '';
    if (d.length === 10) return d;
    const [a, b] = bounds(d);
    return isoDay(edge === 'start' ? a : b);
  }

  const presets: { id: typeof f.when; label: string }[] = [
    { id: 'any', label: 'Any time' },
    { id: '30d', label: 'Next 30 days' },
    { id: '3m', label: 'Next 3 months' },
    { id: 'thisyear', label: 'This year' },
    { id: 'nextyear', label: 'Next year' },
    { id: 'custom', label: 'Pick dates' },
  ];
</script>

<div class="panel" id="filters">
  <div class="head">
    <h2>Filters</h2>
    <button class="btn ghost" type="button" onclick={resetFilters}>Clear all</button>
  </div>

  <fieldset class="group">
    <legend>When</legend>
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
            value={full(f.from, 'start')}
            onchange={(ev) => (app.filters.from = ev.currentTarget.value)}
          /></label
        >
        <label
          >To <input
            type="date"
            value={full(f.to, 'end')}
            onchange={(ev) => (app.filters.to = ev.currentTarget.value)}
          /></label
        >
      </div>
    {/if}
    {#if f.when !== 'any'}
      <label class="check"
        ><input type="checkbox" bind:checked={app.filters.byDeadline} /> Also match deadlines in this
        period</label
      >
    {/if}
  </fieldset>

  <fieldset class="group">
    <legend>Applications</legend>
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
  </fieldset>

  <fieldset class="group">
    <legend>Show</legend>
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showExpected} /> Expected (unconfirmed) editions</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showPast} /> Past events</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.filters.showCancelled} /> Cancelled events</label
    >
  </fieldset>

  <Facet
    title="Event type"
    options={opts(
      'types',
      meta.types.map((t) => ({ value: t.id, label: t.name })),
      true,
    )}
    selected={f.types}
    onToggle={toggle('types')}
  />
  <Facet
    title="Topic"
    options={topicOptions}
    selected={f.topics}
    onToggle={toggle('topics')}
    limit={12}
  />
  <Facet
    title="Format"
    options={opts(
      'formats',
      Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label })),
    )}
    selected={f.formats}
    onToggle={toggle('formats')}
  />
  <Facet
    title="Continent"
    options={dynamic('continents', (v) =>
      v === 'online' ? 'Online only' : (CONTINENT_NAMES[v as keyof typeof CONTINENT_NAMES] ?? v),
    )}
    selected={f.continents}
    onToggle={toggle('continents')}
  />
  <Facet
    title="Country"
    options={dynamic('countries', (v) => `${flag(v)} ${countryName(v)}`)}
    selected={f.countries}
    onToggle={toggle('countries')}
    searchable
  />
  <Facet
    title="City"
    options={dynamic('cities', (v) => {
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
    options={dynamic('orgTypes', (v) => ORG_TYPE_LABEL[v] ?? v)}
    selected={f.orgTypes}
    onToggle={toggle('orgTypes')}
  />
  <Facet
    title="Organiser"
    options={dynamic('orgs', (v) => meta.orgs[v]?.name ?? v)}
    selected={f.orgs}
    onToggle={toggle('orgs')}
    searchable
    limit={6}
  />

  <fieldset class="group">
    <legend>Cost & support</legend>
    {#each [['free', 'Free'], ['paid', 'Paid'], ['unknown', 'Not found yet']] as [v, label] (v)}
      <label class="check">
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
  </fieldset>

  <Facet
    title="Audience"
    options={opts('audience', [
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
    gap: 22px;
    padding: 16px 16px 24px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    font-size: 1.05rem;
  }
  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  legend {
    font-weight: 700;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 4px;
    padding: 0;
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
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 2px 6px;
    font-size: 0.92rem;
    cursor: pointer;
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
