<script lang="ts">
  import { formatPartial } from '../lib/dates';
  import { DEFAULT_FILTERS, FACETS, type FacetKey } from '../lib/filters';
  import { FORMAT_LABEL, ORG_TYPE_LABEL } from '../lib/format';
  import { CONTINENT_NAMES, countryName } from '../lib/geo';
  import { app, resetFilters, setRanges } from '../lib/state.svelte';
  import { toIntervals, type Interval } from '../lib/ranges';
  import { isoDay, monthName } from '../lib/dates';
  import type { Meta } from '../lib/types';

  let { meta }: { meta: Meta } = $props();

  function label(key: FacetKey, v: string): string {
    switch (key) {
      case 'types':
        return meta.types.find((t) => t.id === v)?.name ?? v;
      case 'topics':
        return meta.topics.find((t) => t.id === v)?.name ?? v;
      case 'formats':
        return FORMAT_LABEL[v] ?? v;
      case 'continents':
        return v === 'online'
          ? 'Online only'
          : (CONTINENT_NAMES[v as keyof typeof CONTINENT_NAMES] ?? v);
      case 'countries':
        return countryName(v);
      case 'cities':
        return v.split('|')[0] ?? v;
      case 'orgTypes':
        return ORG_TYPE_LABEL[v] ?? v;
      case 'orgs':
        return meta.orgs[v]?.name ?? v;
      case 'cost':
        return v === 'unknown' ? 'Cost not found yet' : v === 'free' ? 'Free' : 'Paid';
      case 'audience':
        return v === 'unknown'
          ? 'Audience not found yet'
          : (meta.audiences.find((a) => a.id === v)?.name ?? v);
    }
  }

  const WHEN: Record<string, string> = {
    '30d': 'Next 30 days',
    '3m': 'Next 3 months',
    thisyear: 'This year',
    nextyear: 'Next year',
  };

  /** "March 2027", "W12 2027"-style labels where the period is a whole month, else "2 Jan → 12 Mar 2027". */
  function periodLabel([a, b]: Interval): string {
    const A = new Date(a);
    const B = new Date(b);
    const wholeMonths = A.getUTCDate() === 1 && new Date(b + 86_400_000).getUTCDate() === 1;
    if (wholeMonths) {
      const m1 = `${monthName(A.getUTCMonth())} ${A.getUTCFullYear()}`;
      const m2 = `${monthName(B.getUTCMonth())} ${B.getUTCFullYear()}`;
      return m1 === m2
        ? `${monthName(A.getUTCMonth(), true)} ${A.getUTCFullYear()}`
        : `${m1} – ${m2}`;
    }
    return a === b
      ? formatPartial(isoDay(a))
      : `${formatPartial(isoDay(a))} → ${formatPartial(isoDay(b))}`;
  }

  interface Chip {
    text: string;
    clear: () => void;
  }
  const chips = $derived.by(() => {
    const f = app.filters;
    const out: Chip[] = [];
    for (const t of f.terms)
      out.push({
        text: `“${t}”`,
        clear: () => (app.filters.terms = app.filters.terms.filter((x) => x !== t)),
      });
    if (f.q) out.push({ text: `“${f.q}”`, clear: () => (app.filters.q = '') });
    for (const k of FACETS)
      for (const v of f[k])
        out.push({
          text: label(k, v),
          clear: () => (app.filters[k] = app.filters[k].filter((x) => x !== v)),
        });
    if (f.when === 'custom') {
      const ivs = toIntervals(f.ranges);
      for (const iv of ivs)
        out.push({ text: periodLabel(iv), clear: () => setRanges(ivs.filter((x) => x !== iv)) });
    } else if (f.when !== 'any')
      out.push({ text: WHEN[f.when]!, clear: () => (app.filters.when = 'any') });
    if (f.deadline !== 'any')
      out.push({
        text: f.deadline === 'open' ? 'Applications open' : 'Closing within 2 weeks',
        clear: () => (app.filters.deadline = 'any'),
      });
    if (f.travel) out.push({ text: 'Travel support', clear: () => (app.filters.travel = false) });
    if (f.realQpu)
      out.push({ text: 'Real quantum hardware', clear: () => (app.filters.realQpu = false) });
    if (f.showExpected !== DEFAULT_FILTERS.showExpected)
      out.push({ text: 'Confirmed only', clear: () => (app.filters.showExpected = true) });
    if (f.showPast)
      out.push({ text: 'Including past', clear: () => (app.filters.showPast = false) });
    if (f.showCancelled)
      out.push({ text: 'Including cancelled', clear: () => (app.filters.showCancelled = false) });
    if (app.mapOnly) out.push({ text: 'Only map area', clear: () => (app.mapOnly = false) });
    return out;
  });
</script>

{#if chips.length}
  <div class="chips" aria-label="Active filters">
    {#each chips as c, i (i + c.text)}
      <button type="button" onclick={c.clear} aria-label="Remove filter {c.text}"
        >{c.text} <span aria-hidden="true">×</span></button
      >
    {/each}
    {#if chips.length > 1}<button type="button" class="all" onclick={resetFilters}>Clear all</button
      >{/if}
  </div>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 0 2px;
  }
  button {
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.82rem;
    font-weight: 600;
    min-height: 32px;
  }
  button.all {
    background: transparent;
    border-color: transparent;
  }
</style>
