// npm run scout-prep [-- --sources 8 --queries 6] — writes .run/sources.txt and .run/queries.txt for the Scout:
// the sources scanned longest ago and the queries used longest ago (docs/04-data-pipeline.md §6).
// Sources with no new events for 6 scans in a row are only scanned again after 8 weeks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { addDays, isoDay, parseDay, todayUTC } from '../src/lib/dates.ts';
import { loadDataset } from './lib/load.ts';

const { values } = parseArgs({
  options: { sources: { type: 'string', default: '8' }, queries: { type: 'string', default: '6' } },
});
const ds = loadDataset();
const today = todayUTC();
const year = new Date(today).getUTCFullYear();

const sources = ds.sources
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
console.log(`${sources.length} sources, ${queries.length} queries for ${isoDay(today)}`);
