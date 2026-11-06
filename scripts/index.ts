// npm run index — the compact index agents read instead of the whole database (docs/04-data-pipeline.md §6).
// Prints one line per event: id | series | name | dates | place | status | urls
import { indexEntry } from './lib/derive.ts';
import { loadDataset } from './lib/load.ts';

const ds = loadDataset();
const rows = ds.events.map(({ doc }) => indexEntry(doc)).sort((a, b) => a.id.localeCompare(b.id));
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows));
} else {
  for (const r of rows)
    console.log(
      [
        r.id,
        r.series ?? '-',
        r.name,
        `${r.start}${r.end ? '..' + r.end : ''}`,
        r.city ? `${r.city}, ${r.country}` : 'online',
        r.status,
        r.urls.join(' '),
      ].join(' | '),
    );
  console.log(`# ${rows.length} events. Series: ${ds.series.map((s) => s.doc.id).join(', ')}`);
  console.log(`# Organisations: ${ds.orgs.map((o) => o.doc.id).join(', ')}`);
}
