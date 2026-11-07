// npm run data:check — every data gate in one command (docs/02-data-model.md §8).
import { loadDataset } from './lib/load.ts';
import { validateDataset } from './lib/validate.ts';

const ds = loadDataset();
const { errors, warnings } = validateDataset(ds);
const gha = !!process.env.GITHUB_ACTIONS;

for (const w of warnings) console.log(gha ? `::warning::${w}` : `warning: ${w}`);
for (const e of errors) {
  const file = e.split(':')[0];
  console.log(gha && file?.startsWith('data/') ? `::error file=${file}::${e}` : `error: ${e}`);
}
console.log(
  `${ds.events.length} events, ${ds.series.length} series, ${ds.orgs.length} organisations: ` +
    `${errors.length} error(s), ${warnings.length} warning(s)`,
);
process.exit(errors.length ? 1 : 0);
