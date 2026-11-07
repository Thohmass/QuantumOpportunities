// npm run queue [-- --limit 25 --flag id1,id2] — events due for a re-check, highest priority first.
import { parseArgs } from 'node:util';
import { todayUTC, parseDay } from '../src/lib/dates.ts';
import { loadDataset } from './lib/load.ts';
import { buildQueue } from './lib/queue.ts';

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '25' },
    flag: { type: 'string', default: '' },
    today: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});
const ds = loadDataset();
const today = values.today ? parseDay(values.today) : todayUTC();
const flagged = new Set(values.flag.split(',').filter(Boolean));
const queue = buildQueue(ds.events, today, flagged);
const top = queue.slice(0, Number(values.limit));
if (values.json) console.log(JSON.stringify(top, null, 2));
else {
  for (const q of top)
    console.log(`${String(q.priority).padStart(3)}  ${q.id}  [${q.file}]  ${q.reason}`);
  console.log(`# ${top.length} of ${queue.length} due events`);
}
