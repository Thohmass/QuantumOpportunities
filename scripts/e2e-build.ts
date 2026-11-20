// npm run e2e:build — builds the site once and makes two copies for the browser tests (docs/03-dev-pipeline.md):
//   .e2e/fixture  frozen sample data (e2e/fixtures/data, as of FIXTURE_DAY): every behaviour test runs here, so new
//                 events can never break a test;
//   .e2e/live     today's data in data/: e2e/live.spec.ts only checks that every view loads without errors.
import { cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeData } from './lib/build-data.ts';
import { FIXTURE_DAY } from '../e2e/fixture-day.ts';

rmSync('.e2e', { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', '.e2e/app', '--emptyOutDir'], {
  stdio: 'inherit',
});
for (const [name, root, now] of [
  ['fixture', 'e2e/fixtures', new Date(FIXTURE_DAY)],
  ['live', '.', new Date()],
] as const) {
  cpSync('.e2e/app', `.e2e/${name}`, { recursive: true });
  rmSync(`.e2e/${name}/data`, { recursive: true, force: true });
  console.log(`${name}: ${writeData(root, `.e2e/${name}/data`, now)} events`);
}
