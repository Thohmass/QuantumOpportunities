// Fields computed from the raw data: completeness, the compact agent index, the built site JSON.
import { precisionOf } from '../../src/lib/dates.ts';
import { CONTINENT_OF } from '../../src/lib/geo.ts';
import type { EventOut, Meta, RawEvent } from '../../src/lib/types.ts';
import type { Dataset } from './load.ts';
import { geocode } from './geocode.ts';
import { normaliseUrl, type IndexEntry } from './similarity.ts';

const NEEDS_DEADLINE = new Set([
  'hackathon',
  'summer_school',
  'winter_school',
  'programme',
  'challenge',
]);
const NEEDS_TEAM = new Set(['hackathon', 'challenge']);

/** Critical fields still missing (docs/02-data-model.md §3). Order = display order. */
export function missingFields(e: RawEvent): string[] {
  const m: string[] = [];
  if (precisionOf(e.dates.start) !== 'day') m.push('exact dates');
  else if (!e.dates.end) m.push('end date');
  if (e.format !== 'online' && !e.location) m.push('location');
  if (!e.url) m.push('official page');
  if (NEEDS_DEADLINE.has(e.type) && !e.deadlines) m.push('deadline');
  if (!e.cost) m.push('cost');
  if (NEEDS_TEAM.has(e.type) && !e.team) m.push('team size');
  return m;
}

export const CRITICAL_FIELDS = [
  'exact dates',
  'end date',
  'location',
  'official page',
  'deadline',
  'cost',
  'team size',
];

export function indexEntry(e: RawEvent): IndexEntry {
  const urls = [
    e.url,
    e.registration_url,
    ...e.sources.filter((s) => s.kind === 'official').map((s) => s.url),
  ]
    .filter((u): u is string => !!u)
    .map(normaliseUrl);
  return {
    id: e.id,
    series: e.series,
    name: e.name,
    start: e.dates.start,
    end: e.dates.end,
    country: e.location?.country,
    city: e.location?.city,
    status: e.status,
    urls: [...new Set(urls)],
  };
}

export function toOutput(e: RawEvent): EventOut {
  const { location, checks, added, ...rest } = e;
  const out: EventOut = {
    ...rest,
    lastChecked: checks.last_checked,
    addedOn: added.date,
    missing: missingFields(e),
  };
  if (location) {
    out.city = location.city;
    out.country = location.country;
    if (location.venue) out.venue = location.venue;
    const ll = location.latlon ?? geocode(location.city, location.country);
    if (ll) [out.lat, out.lon] = [Math.round(ll[0] * 1e4) / 1e4, Math.round(ll[1] * 1e4) / 1e4];
    const cont = CONTINENT_OF[location.country];
    if (cont) out.continent = cont;
  }
  return out;
}

export function buildMeta(ds: Dataset, events: EventOut[], now: Date, todayIso: string): Meta {
  const upcoming = events.filter(
    (e) =>
      (e.dates.end ?? e.dates.start) >= todayIso.slice(0, (e.dates.end ?? e.dates.start).length),
  );
  const filled: Record<string, number> = {};
  for (const f of CRITICAL_FIELDS) {
    const relevant = upcoming.filter((e) => {
      if (f === 'deadline') return NEEDS_DEADLINE.has(e.type);
      if (f === 'team size') return NEEDS_TEAM.has(e.type);
      if (f === 'location') return e.format !== 'online';
      return true;
    });
    filled[f] = relevant.length
      ? relevant.filter((e) => !e.missing.includes(f)).length / relevant.length
      : 1;
  }
  const byStatus: Record<string, number> = {};
  for (const e of events) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  const lastRuns: Meta['health']['lastRuns'] = {};
  for (const r of ds.runs)
    if (!lastRuns[r.job] || lastRuns[r.job]! < r.date) lastRuns[r.job] = r.date;
  return {
    generatedAt: now.toISOString(),
    types: ds.types,
    topics: ds.topics,
    audiences: ds.audiences,
    orgs: Object.fromEntries(
      ds.orgs.map(({ doc: o }) => [
        o.id,
        { name: o.name, type: o.type, ...(o.country ? { country: o.country } : {}) },
      ]),
    ),
    series: Object.fromEntries(
      ds.series.map(({ doc: s }) => [
        s.id,
        {
          name: s.name,
          ...(s.url ? { url: s.url } : {}),
          ...(s.typical_month ? { typicalMonth: s.typical_month } : {}),
        },
      ]),
    ),
    redirects: ds.redirects,
    health: { total: events.length, byStatus, filled, lastRuns },
  };
}
