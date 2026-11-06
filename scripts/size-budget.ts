// Fails the build when the initial JS or the event data exceed their gzip budgets (docs/01-mvp-spec.md §5).
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGET_INITIAL_JS = 100 * 1024;
const BUDGET_DATA = 150 * 1024;

const gz = (path: string) => gzipSync(readFileSync(path)).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
// Initial JS = the entry script plus every chunk the browser preloads with it.
const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
const initial = [...new Set(refs)].reduce((sum, f) => sum + gz(join(DIST, f)), 0);

const dataFile = join(DIST, 'data', 'events.json');
const data = existsSync(dataFile) ? gz(dataFile) : 0;

let failed = false;
const report = (label: string, size: number, budget: number) => {
  const ok = size <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${kb(size)} gzip (budget ${kb(budget)})`);
};
report('initial JS', initial, BUDGET_INITIAL_JS);
report('event data', data, BUDGET_DATA);
if (failed) process.exit(1);
