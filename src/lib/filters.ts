// Filter state, matching and faceted counts. Pure functions: the UI and the URL both go through here.
import { addDays, bounds } from './dates';
import { overlapsAny, toIntervals, type Interval } from './ranges';
import type { Ev } from './model';
import type { Meta } from './types';

export type DatePreset = 'any' | '30d' | '3m' | 'thisyear' | 'nextyear' | 'custom';
export type DeadlineFilter = 'any' | 'open' | '2w';
export type SortKey = 'date' | 'start' | 'added' | 'updated';
export type View = 'explore' | 'list' | 'timeline' | 'map' | 'about';

export interface Filters {
  /** The text being typed in the search box (matches live). */
  q: string;
  /** Search terms confirmed with Enter, shown as chips; an event must match all of them. */
  terms: string[];
  types: string[];
  topics: string[];
  formats: string[];
  continents: string[];
  countries: string[];
  cities: string[];
  orgTypes: string[];
  orgs: string[];
  cost: string[]; // free | paid | unknown  ('mixed' counts as paid)
  audience: string[]; // audience ids | unknown
  travel: boolean;
  realQpu: boolean;
  showExpected: boolean;
  showPast: boolean;
  showCancelled: boolean;
  when: DatePreset;
  /** Selected periods for 'custom', e.g. ["2027-01-01~2027-01-31", "2027-03-01~2027-03-31"]. */
  ranges: string[];
  byDeadline: boolean; // date filters also match deadlines
  deadline: DeadlineFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  terms: [],
  types: [],
  topics: [],
  formats: [],
  continents: [],
  countries: [],
  cities: [],
  orgTypes: [],
  orgs: [],
  cost: [],
  audience: [],
  travel: false,
  realQpu: false,
  showExpected: true,
  showPast: false,
  showCancelled: false,
  when: 'any',
  ranges: [],
  byDeadline: false,
  deadline: 'any',
  sort: 'date',
};

export type FacetKey =
  | 'types'
  | 'topics'
  | 'formats'
  | 'continents'
  | 'countries'
  | 'cities'
  | 'orgTypes'
  | 'orgs'
  | 'cost'
  | 'audience';

export interface Ctx {
  meta: Meta;
  today: number;
  /** Event ids matching the text query (undefined = no query). */
  searchHits?: Set<string>;
  /** Topic id → itself plus all descendants. */
  topicTree: Map<string, Set<string>>;
}

export function topicTree(meta: Meta): Map<string, Set<string>> {
  const children = new Map<string, string[]>();
  for (const t of meta.topics)
    if (t.parent) children.set(t.parent, [...(children.get(t.parent) ?? []), t.id]);
  const tree = new Map<string, Set<string>>();
  const collect = (id: string, into: Set<string>) => {
    into.add(id);
    for (const c of children.get(id) ?? []) collect(c, into);
  };
  for (const t of meta.topics) {
    const s = new Set<string>();
    collect(t.id, s);
    tree.set(t.id, s);
  }
  return tree;
}

/** The values an event has for a facet (an event can have several, e.g. topics). */
export function facetValues(e: Ev, key: FacetKey, ctx: Ctx): string[] {
  switch (key) {
    case 'types':
      return [e.type];
    case 'topics':
      return e.topics ?? [];
    case 'formats':
      return [e.format];
    case 'continents':
      return e.continent ? [e.continent] : e.format === 'online' ? ['online'] : [];
    case 'countries':
      return e.country ? [e.country] : [];
    case 'cities':
      return e.city && e.country ? [`${e.city}|${e.country}`] : [];
    case 'orgTypes':
      return [
        ...new Set(
          [...(e.organizers ?? []), ...(e.partners ?? [])].map(
            (o) => ctx.meta.orgs[o]?.type ?? 'other',
          ),
        ),
      ];
    case 'orgs':
      return [...(e.organizers ?? []), ...(e.partners ?? [])];
    case 'cost':
      return [!e.cost ? 'unknown' : e.cost.kind === 'free' ? 'free' : 'paid'];
    case 'audience':
      return e.audience === 'n/a' ? [] : e.audience?.length ? e.audience : ['unknown'];
  }
}

function matchesFacet(e: Ev, key: FacetKey, selected: string[], ctx: Ctx): boolean {
  if (!selected.length) return true;
  const values = facetValues(e, key, ctx);
  if (key === 'topics') {
    return selected.some((s) => {
      const accepted = ctx.topicTree.get(s) ?? new Set([s]);
      return values.some((v) => accepted.has(v));
    });
  }
  return values.some((v) => selected.includes(v));
}

/** The selected periods for the date filter (UTC-day intervals), or undefined for "any time". */
export function dateRanges(f: Filters, today: number): Interval[] | undefined {
  const y = new Date(today).getUTCFullYear();
  switch (f.when) {
    case 'any':
      return undefined;
    case '30d':
      return [[today, addDays(today, 30)]];
    case '3m':
      return [[today, addDays(today, 91)]];
    case 'thisyear':
      return [[Date.UTC(y, 0, 1), Date.UTC(y, 11, 31)]];
    case 'nextyear':
      return [[Date.UTC(y + 1, 0, 1), Date.UTC(y + 1, 11, 31)]];
    case 'custom': {
      const iv = toIntervals(f.ranges);
      return iv.length ? iv : undefined;
    }
  }
}

/** Every non-facet condition: search, status, dates, deadlines, booleans. */
function matchesBase(e: Ev, f: Filters, ctx: Ctx): boolean {
  if (ctx.searchHits && !ctx.searchHits.has(e.id)) return false;
  if (e.status === 'cancelled' && !f.showCancelled) return false;
  if (e.status === 'expected' && !f.showExpected) return false;
  if (e.isPast && !f.showPast) return false;
  if (f.travel && !(e.support && e.support !== 'n/a' && e.support.travel_grants)) return false;
  if (f.realQpu && !(e.hardware && e.hardware !== 'n/a' && e.hardware.real_qpu)) return false;
  if (f.deadline === 'open' && !e.nextDeadline) return false;
  if (f.deadline === '2w' && !(e.nextDeadline && e.nextDeadline.day - ctx.today <= 14 * 86_400_000))
    return false;
  const ranges = dateRanges(f, ctx.today);
  if (ranges) {
    const eventHit = overlapsAny(ranges, e.span[0], e.span[1]);
    const deadlineHit =
      f.byDeadline &&
      Array.isArray(e.deadlines) &&
      e.deadlines.some((d) => {
        const [a, b] = bounds(d.date);
        return overlapsAny(ranges, a, b);
      });
    if (!eventHit && !deadlineHit) return false;
  }
  return true;
}

export const FACETS: FacetKey[] = [
  'types',
  'topics',
  'formats',
  'continents',
  'countries',
  'cities',
  'orgTypes',
  'orgs',
  'cost',
  'audience',
];

export function applyFilters(events: Ev[], f: Filters, ctx: Ctx): Ev[] {
  return events.filter(
    (e) => matchesBase(e, f, ctx) && FACETS.every((k) => matchesFacet(e, k, f[k], ctx)),
  );
}

/**
 * Option counts per facet: for facet K, count events that pass every other filter (so picking an option
 * in K never makes K's own options drop to zero).
 */
export function facetCounts(
  events: Ev[],
  f: Filters,
  ctx: Ctx,
): Record<FacetKey, Map<string, number>> {
  const base = events.filter((e) => matchesBase(e, f, ctx));
  const out = {} as Record<FacetKey, Map<string, number>>;
  for (const key of FACETS) {
    const counts = new Map<string, number>();
    for (const e of base) {
      if (!FACETS.every((k) => k === key || matchesFacet(e, k, f[k], ctx))) continue;
      for (const v of new Set(facetValues(e, key, ctx))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (key === 'topics') {
      // A parent topic counts every event tagged with it or any descendant.
      const rolled = new Map<string, number>();
      for (const [parent, set] of ctx.topicTree) {
        let n = 0;
        for (const e of base) {
          if (!FACETS.every((k) => k === key || matchesFacet(e, k, f[k], ctx))) continue;
          if ((e.topics ?? []).some((t) => set.has(t))) n++;
        }
        if (n) rolled.set(parent, n);
      }
      out[key] = rolled;
    } else out[key] = counts;
  }
  return out;
}

export function sortEvents(events: Ev[], key: SortKey): Ev[] {
  const byStart = (a: Ev, b: Ev) => a.span[0] - b.span[0] || a.name.localeCompare(b.name);
  const sorted = [...events];
  switch (key) {
    case 'date':
      return sorted.sort(
        (a, b) =>
          Number(a.isPast) - Number(b.isPast) ||
          (a.isPast ? b.span[0] - a.span[0] : a.keyDay - b.keyDay) ||
          byStart(a, b),
      );
    case 'start':
      return sorted.sort(byStart);
    case 'added':
      return sorted.sort((a, b) => b.addedOn.localeCompare(a.addedOn) || byStart(a, b));
    case 'updated':
      return sorted.sort((a, b) => b.lastChecked.localeCompare(a.lastChecked) || byStart(a, b));
  }
}

export function activeCount(f: Filters): number {
  let n = FACETS.reduce((s, k) => s + f[k].length, 0);
  if (f.when !== 'any' && !(f.when === 'custom' && !f.ranges.length)) n++;
  if (f.deadline !== 'any') n++;
  if (f.travel) n++;
  if (f.realQpu) n++;
  if (!f.showExpected) n++;
  if (f.showPast) n++;
  if (f.showCancelled) n++;
  return n;
}

/** Every value each facet can take across the whole database: the fixed option lists of the filter panel. */
export function facetUniverse(events: Ev[], ctx: Ctx): Record<FacetKey, Set<string>> {
  const out = Object.fromEntries(FACETS.map((k) => [k, new Set<string>()])) as Record<
    FacetKey,
    Set<string>
  >;
  for (const e of events)
    for (const k of FACETS) for (const v of facetValues(e, k, ctx)) out[k].add(v);
  return out;
}
