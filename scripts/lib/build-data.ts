// Compiles a data folder (data/**/*.yaml) into events.json and meta.json for the site.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoDay, todayUTC } from '../../src/lib/dates.ts';
import { buildMeta, toOutput } from './derive.ts';
import { loadDataset } from './load.ts';
import { validateDataset } from './validate.ts';

/**
 * Reads the data under `dataRoot`/data, validates it against this repository's schema, and writes the two JSON files
 * to `outDir`. `now` decides what counts as upcoming in meta.json. Returns the number of events written.
 */
export function writeData(dataRoot: string, outDir: string, now = new Date()): number {
  const ds = loadDataset(dataRoot);
  const { errors } = validateDataset({ ...ds, root: process.cwd() });
  if (errors.length)
    throw new Error(
      `data in ${join(dataRoot, 'data')} has ${errors.length} error(s): ${errors[0]}`,
    );
  const events = ds.events
    .map(({ doc }) => toOutput(doc))
    .sort((a, b) => a.dates.start.localeCompare(b.dates.start) || a.id.localeCompare(b.id));
  const meta = buildMeta(ds, events, now, isoDay(todayUTC(now)));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'events.json'), JSON.stringify(events));
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta));
  return events.length;
}
