// npm run find-similar -- --name "QHack 2027" [--start 2027-10] [--end 2027-10-20] [--country CA] [--url https://…] [--series qhack]
// Run before creating any event. Prints likely matches; exit code 3 means "probably a duplicate".
import { parseArgs } from 'node:util';
import { indexEntry } from './lib/derive.ts';
import { loadDataset } from './lib/load.ts';
import { DUPLICATE_THRESHOLD, findSimilar, nameSimilarity } from './lib/similarity.ts';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    country: { type: 'string' },
    url: { type: 'string' },
    series: { type: 'string' },
    org: { type: 'string' },
  },
});
const ds = loadDataset();

if (values.org) {
  const hits = ds.orgs
    .map(({ doc }) => ({
      id: doc.id,
      name: doc.name,
      score: Math.max(
        nameSimilarity(values.org!, doc.name),
        ...(doc.aliases ?? []).map((a) => nameSimilarity(values.org!, a)),
      ),
    }))
    .filter((h) => h.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  console.log(
    hits.length
      ? hits.map((h) => `${h.score.toFixed(2)}  org ${h.id}  (${h.name})`).join('\n')
      : 'no similar organisation',
  );
}
if (values.name) {
  const seriesHits = ds.series
    .map(({ doc }) => ({
      id: doc.id,
      name: doc.name,
      score: Math.max(
        nameSimilarity(values.name!, doc.name),
        ...(doc.aliases ?? []).map((a) => nameSimilarity(values.name!, a)),
      ),
    }))
    .filter((h) => h.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const h of seriesHits) console.log(`${h.score.toFixed(2)}  series ${h.id}  (${h.name})`);
  const matches = findSimilar(
    {
      name: values.name,
      start: values.start,
      end: values.end,
      country: values.country,
      url: values.url,
      series: values.series,
    },
    ds.events.map(({ doc }) => indexEntry(doc)),
  );
  if (!matches.length) console.log('no similar event');
  for (const m of matches)
    console.log(`${m.score.toFixed(2)}  event ${m.id}  (${m.name}): ${m.reasons.join(', ')}`);
  if (matches[0] && matches[0].score >= DUPLICATE_THRESHOLD) {
    console.log(
      `=> probably the same as ${matches[0].id}: update that file instead of creating a new one`,
    );
    process.exit(3);
  }
}
