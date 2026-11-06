// npm run stubs [-- --dry-run] — creates expected-edition files for recurring series (docs/04-data-pipeline.md §3).
import { parseArgs } from 'node:util';
import { parseDay, todayUTC } from '../src/lib/dates.ts';
import { loadDataset } from './lib/load.ts';
import { planStubs } from './lib/stubs.ts';
import { writeEvent } from './lib/write.ts';

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false }, today: { type: 'string' } },
});
const ds = loadDataset();
const today = values.today ? parseDay(values.today) : todayUTC();
const ids = new Set([...ds.events.map((e) => e.doc.id), ...Object.keys(ds.redirects)]);
const stubs = planStubs(
  ds.series.map((s) => s.doc),
  ds.events.map((e) => e.doc),
  today,
  ids,
);
for (const s of stubs) {
  console.log(
    `${values['dry-run'] ? 'would create' : 'created'} ${s.file} (${s.event.expected?.confidence} confidence)`,
  );
  if (!values['dry-run']) writeEvent(s.file, s.event);
}
if (!stubs.length) console.log('no new expected editions');
