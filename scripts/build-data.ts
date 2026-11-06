// npm run data:build — compiles data/**/*.yaml into public/data/events.json and meta.json for the site.
import { mkdirSync, writeFileSync } from 'node:fs';
import { isoDay, todayUTC } from '../src/lib/dates.ts';
import { buildMeta, toOutput } from './lib/derive.ts';
import { loadDataset } from './lib/load.ts';
import { validateDataset } from './lib/validate.ts';

const ds = loadDataset();
const { errors } = validateDataset(ds);
if (errors.length) {
  console.error(`data has ${errors.length} error(s); run npm run data:check`);
  process.exit(1);
}
const now = new Date();
const events = ds.events
  .map(({ doc }) => toOutput(doc))
  .sort((a, b) => a.dates.start.localeCompare(b.dates.start) || a.id.localeCompare(b.id));
const meta = buildMeta(ds, events, now, isoDay(todayUTC(now)));

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/events.json', JSON.stringify(events));
writeFileSync('public/data/meta.json', JSON.stringify(meta));
console.log(`wrote ${events.length} events`);
