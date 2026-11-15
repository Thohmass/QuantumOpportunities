// npm run scout-prep [-- --sources 8 --queries 6] — writes .run/sources.txt and .run/queries.txt for the Scout:
// the sources scanned longest ago and the queries used longest ago (docs/04-data-pipeline.md §6).
// Sources with no new events for 6 scans in a row are only scanned again after 8 weeks.
// Sources with a `feed` are read here instead (issue #42): their new quantum items go to .run/feeds.txt.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { addDays, isoDay, parseDay, todayUTC } from '../src/lib/dates.ts';
import { indexEntry } from './lib/derive.ts';
import { feedCandidates, type FeedLine } from './lib/feed-candidates.ts';
import { loadDataset } from './lib/load.ts';

const { values } = parseArgs({
  options: { sources: { type: 'string', default: '8' }, queries: { type: 'string', default: '6' } },
});
const ds = loadDataset();
const today = todayUTC();
const year = new Date(today).getUTCFullYear();

const sources = ds.sources
  .filter((s) => !s.feed)
  .filter(
    (s) =>
      !(
        s.zero_yield_streak &&
        s.zero_yield_streak >= 6 &&
        s.last_scanned &&
        parseDay(s.last_scanned) > addDays(today, -56)
      ),
  )
  .sort(
    (a, b) =>
      (a.last_scanned ?? '').localeCompare(b.last_scanned ?? '') || a.id.localeCompare(b.id),
  )
  .slice(0, Number(values.sources));
const queries = [...ds.queries]
  .sort((a, b) => (a.last_used ?? '').localeCompare(b.last_used ?? '') || a.q.localeCompare(b.q))
  .slice(0, Number(values.queries));

mkdirSync('.run', { recursive: true });
writeFileSync(
  '.run/sources.txt',
  sources.map((s) => `${s.id} | ${s.name} | ${s.url}${s.note ? ' | ' + s.note : ''}`).join('\n') +
    '\n',
);
writeFileSync(
  '.run/queries.txt',
  queries.map((q) => `${q.q}   (use ${year} and ${year + 1})`).join('\n') + '\n',
);

// Feeds: fetched politely (robots.txt, a named user agent, one at a time, 20 s timeout).
const UA = 'QuantumOpportunitiesScout/1.0 (+https://thohmass.github.io/QuantumOpportunities/)';
async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const robotsCache = new Map<string, Promise<string>>();
function robots(url: string): Promise<string> {
  const origin = new URL(url).origin;
  if (!robotsCache.has(origin))
    robotsCache.set(
      origin,
      get(`${origin}/robots.txt`).catch(() => ''),
    );
  return robotsCache.get(origin)!;
}
const lines: FeedLine[] = await feedCandidates(
  ds.sources.filter((s) => s.feed),
  ds.events.filter(({ doc }) => doc?.dates).map(({ doc }) => indexEntry(doc)),
  isoDay(today),
  { get, robots },
);
writeFileSync('.run/feeds.txt', lines.map((l) => l.text).join('\n') + (lines.length ? '\n' : ''));
const items = lines.filter((l) => !l.error).length;
console.log(
  `${sources.length} sources, ${queries.length} queries, ${items} feed items for ${isoDay(today)}`,
);
