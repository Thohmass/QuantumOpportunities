// npm run e2e:fixture — refreshes the frozen test data from data/ (logs left out). Afterwards set FIXTURE_DAY in
// e2e/fixture-day.ts to today and run npm run test:e2e; tests that relied on the old data may need updating.
import { cpSync, rmSync } from 'node:fs';

rmSync('e2e/fixtures/data', { recursive: true, force: true });
cpSync('data', 'e2e/fixtures/data', {
  recursive: true,
  filter: (src) => !src.startsWith('data/logs'),
});
console.log(
  'Copied data/ to e2e/fixtures/data. Now set FIXTURE_DAY in e2e/fixture-day.ts to today.',
);
