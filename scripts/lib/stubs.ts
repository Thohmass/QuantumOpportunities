// Expected-edition stubs (docs/04-data-pipeline.md §3): for recurring series, predict the next edition
// from past ones so it shows as "Expected" until an official source announces it.
import { bounds, eventSpan, isoDay } from '../../src/lib/dates.ts';
import type { Confidence, RawEvent, RawSeries } from '../../src/lib/types.ts';

const HORIZON_DAYS = 365;

export interface Stub {
  file: string;
  event: RawEvent;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function planStubs(
  series: RawSeries[],
  events: RawEvent[],
  todayMs: number,
  existingIds: Set<string>,
): Stub[] {
  const out: Stub[] = [];
  for (const s of series) {
    if (s.cadence !== 'annual' && s.cadence !== 'biennial') continue;
    const step = s.cadence === 'annual' ? 1 : 2;
    const editions = events
      .filter((e) => e.series === s.id && e.status !== 'cancelled')
      .sort((a, b) => a.dates.start.localeCompare(b.dates.start));
    const last = editions[editions.length - 1];
    if (!last) continue;
    // Only predict once the latest known edition has started (otherwise it's still the current one).
    if (bounds(last.dates.start)[0] > todayMs) continue;
    const year = Number(last.dates.start.slice(0, 4)) + step;
    const id = `${s.id}-${year}`;
    if (existingIds.has(id) || editions.some((e) => e.dates.start.startsWith(String(year))))
      continue;

    const dated = editions.filter((e) => e.dates.start.length >= 7 && e.status !== 'expected');
    const month = dated.length
      ? Number(dated[dated.length - 1]!.dates.start.slice(5, 7))
      : s.typical_month;
    if (!month) continue;
    const start = `${year}-${pad(month)}`;
    if (bounds(start)[0] - todayMs > HORIZON_DAYS * 86_400_000) continue;
    const lastEnd =
      last.dates.end && last.dates.end.length >= 7 ? Number(last.dates.end.slice(5, 7)) : month;
    const endMonth = lastEnd >= month ? lastEnd : month;

    const confidence: Confidence =
      dated.length >= 2 ? 'high' : dated.length === 1 ? 'medium' : 'low';
    const past = dated
      .slice(-2)
      .map((e) => e.dates.start.slice(0, 7))
      .join(', ');
    const today = isoDay(todayMs);
    const sources = last.sources.filter((x) => x.kind === 'official').slice(0, 1);
    const event: RawEvent = {
      id,
      series: s.id,
      name: last.name
        .replace(String(last.dates.start.slice(0, 4)), String(year))
        .replace(/\s+$/, ''),
      type: last.type,
      status: 'expected',
      format: last.format,
      dates: { start, ...(endMonth !== month ? { end: `${year}-${pad(endMonth)}` } : {}) },
      ...(last.location
        ? { location: { city: last.location.city, country: last.location.country } }
        : {}),
      ...(last.organizers ? { organizers: last.organizers } : {}),
      ...(last.topics ? { topics: last.topics } : {}),
      ...(s.url || last.url ? { url: s.url ?? last.url } : {}),
      expected: {
        basis: `${s.cadence} series; previous edition${dated.length > 1 ? 's' : ''} ${past || 'month from the series record'}`,
        confidence,
      },
      sources: sources.length ? sources : last.sources.slice(0, 1),
      checks: { last_checked: today, unchanged_streak: 0 },
      added: { date: today, by: 'expected-stub' },
    };
    if (eventSpan(event.dates.start, event.dates.end)[1] < todayMs) continue;
    out.push({ file: `data/events/${year}/${id}.yaml`, event });
  }
  return out;
}
