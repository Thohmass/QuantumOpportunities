// npm run linkcheck [-- --out .queue/flags.txt] — checks every upcoming event's official URL.
// Broken links are printed and written as event ids, which the Refresher's queue gives priority.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { eventSpan, todayUTC } from '../src/lib/dates.ts';
import { loadDataset } from './lib/load.ts';

const { values } = parseArgs({
  options: { out: { type: 'string' }, concurrency: { type: 'string', default: '6' } },
});
const ds = loadDataset();
const today = todayUTC();
const targets = ds.events
  .map((e) => e.doc)
  .filter(
    (e) => e.url && e.status !== 'cancelled' && eventSpan(e.dates.start, e.dates.end)[1] >= today,
  );

async function check(url: string): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'user-agent':
            'QuantumOpportunities-linkcheck/1.0 (+https://github.com/Thohmass/QuantumOpportunities)',
        },
      });
      if (res.ok) return null;
      if (method === 'GET' || ![403, 405, 501].includes(res.status)) return `HTTP ${res.status}`;
    } catch (e) {
      if (method === 'GET') return (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable';
    }
  }
  return 'unreachable';
}

const broken: { id: string; url: string; why: string }[] = [];
const queue = [...targets];
await Promise.all(
  Array.from({ length: Number(values.concurrency) }, async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const why = await check(e.url!);
      if (why) broken.push({ id: e.id, url: e.url!, why });
    }
  }),
);
for (const b of broken) console.log(`broken  ${b.id}  ${b.url}  (${b.why})`);
console.log(`# ${targets.length} links checked, ${broken.length} broken`);
if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, broken.map((b) => b.id).join(','));
}
