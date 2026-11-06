// All data checks behind `npm run data:check` (docs/02-data-model.md §8). Returns errors and warnings.
import { readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { bounds, eventSpan } from '../../src/lib/dates.ts';
import type { Dataset } from './load.ts';
import { geocode } from './geocode.ts';
import { indexEntry } from './derive.ts';
import { DUPLICATE_THRESHOLD, findSimilar, normaliseUrl } from './similarity.ts';

export interface Report {
  errors: string[];
  warnings: string[];
}

function compile(root: string): {
  event: ValidateFunction;
  series: ValidateFunction;
  org: ValidateFunction;
  reg: (def: string) => ValidateFunction;
} {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const load = (f: string) => JSON.parse(readFileSync(join(root, 'schema', f), 'utf8'));
  ajv.addSchema(load('registries.schema.json'));
  return {
    event: ajv.compile(load('event.schema.json')),
    series: ajv.compile(load('series.schema.json')),
    org: ajv.compile(load('org.schema.json')),
    reg: (def) => ajv.getSchema(`registries.schema.json#/$defs/${def}`)!,
  };
}

function schemaErrors(v: ValidateFunction): string {
  return (v.errors ?? [])
    .filter((e) => e.keyword !== 'oneOf' && e.keyword !== 'const')
    .slice(0, 5)
    .map(
      (e) =>
        `${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? ` (${e.params.additionalProperty})` : ''}`,
    )
    .join('; ');
}

export function validateDataset(ds: Dataset): Report {
  const errors: string[] = [...ds.parseErrors];
  const warnings: string[] = [];
  const v = compile(ds.root);

  const typeIds = new Set(ds.types.map((t) => t.id));
  const topicIds = new Set(ds.topics.map((t) => t.id));
  const audienceIds = new Set(ds.audiences.map((t) => t.id));
  const orgIds = new Set(ds.orgs.map((o) => o.doc.id));
  const seriesIds = new Set(ds.series.map((s) => s.doc.id));

  // Registries and taxonomies
  for (const [name, list, def] of [
    ['data/taxonomy/event-types.yaml', ds.types, 'taxonomy'],
    ['data/taxonomy/topics.yaml', ds.topics, 'taxonomy'],
    ['data/taxonomy/audiences.yaml', ds.audiences, 'taxonomy'],
    ['data/sources.yaml', ds.sources, 'sources'],
    ['data/queries.yaml', ds.queries, 'queries'],
    ['data/leads.yaml', ds.leads, 'leads'],
    ['data/not-duplicates.yaml', ds.notDuplicates, 'notDuplicates'],
    ['data/redirects.yaml', ds.redirects, 'redirects'],
  ] as const) {
    const fn = v.reg(def);
    if (!fn(list)) errors.push(`${name}: ${schemaErrors(fn)}`);
  }
  for (const t of ds.topics)
    if (t.parent && !topicIds.has(t.parent))
      errors.push(`topics: ${t.id} has unknown parent ${t.parent}`);

  // Organisations and series
  const seen = new Map<string, string>();
  const unique = (kind: string, id: string, file: string) => {
    const k = `${kind}:${id}`;
    if (seen.has(k)) errors.push(`${file}: duplicate ${kind} id "${id}" (also in ${seen.get(k)})`);
    seen.set(k, file);
  };
  for (const { file, doc } of ds.orgs) {
    if (!v.org(doc)) errors.push(`${file}: ${schemaErrors(v.org)}`);
    if (basename(file, '.yaml') !== doc.id)
      errors.push(`${file}: file name must be <id>.yaml (id is "${doc.id}")`);
    if (doc.parent && !orgIds.has(doc.parent))
      errors.push(`${file}: unknown parent organisation "${doc.parent}"`);
    unique('org', doc.id, file);
  }
  for (const { file, doc } of ds.series) {
    if (!v.series(doc)) errors.push(`${file}: ${schemaErrors(v.series)}`);
    if (basename(file, '.yaml') !== doc.id)
      errors.push(`${file}: file name must be <id>.yaml (id is "${doc.id}")`);
    for (const o of doc.organizers ?? [])
      if (!orgIds.has(o)) errors.push(`${file}: unknown organisation "${o}"`);
    unique('series', doc.id, file);
  }

  // Events
  const urlOwners = new Map<string, string>();
  for (const { file, doc: e } of ds.events) {
    if (!v.event(e)) {
      errors.push(`${file}: ${schemaErrors(v.event)}`);
      continue; // the rest assumes a well-formed event
    }
    const at = (msg: string) => `${file}: ${msg}`;
    if (basename(file, '.yaml') !== e.id)
      errors.push(at(`file name must be <id>.yaml (id is "${e.id}")`));
    if (basename(dirname(file)) !== e.dates.start.slice(0, 4))
      errors.push(at(`must live in data/events/${e.dates.start.slice(0, 4)}/ (the start year)`));
    unique('event', e.id, file);
    if (ds.redirects[e.id])
      errors.push(at(`id "${e.id}" is a redirect source and cannot be reused`));

    if (!typeIds.has(e.type)) errors.push(at(`unknown type "${e.type}"`));
    for (const t of e.topics ?? []) if (!topicIds.has(t)) errors.push(at(`unknown topic "${t}"`));
    if (Array.isArray(e.audience))
      for (const a of e.audience)
        if (!audienceIds.has(a)) errors.push(at(`unknown audience "${a}"`));
    for (const o of [...(e.organizers ?? []), ...(e.partners ?? [])])
      if (!orgIds.has(o)) errors.push(at(`unknown organisation "${o}"`));
    if (e.series && !seriesIds.has(e.series)) errors.push(at(`unknown series "${e.series}"`));

    // Dates
    if (e.dates.end && eventSpan(e.dates.end)[1] < bounds(e.dates.start)[0])
      errors.push(at('dates.end is before dates.start'));
    if (Array.isArray(e.deadlines))
      for (const d of e.deadlines)
        if (bounds(d.date)[0] > eventSpan(e.dates.start, e.dates.end)[1])
          warnings.push(at(`deadline ${d.date} is after the event ends`));
    if (e.team && e.team !== 'n/a' && e.team.min && e.team.max && e.team.min > e.team.max)
      errors.push(at('team.min > team.max'));
    if (e.cost && e.cost.min !== undefined && e.cost.max !== undefined && e.cost.min > e.cost.max)
      errors.push(at('cost.min > cost.max'));
    if (e.cost?.kind === 'free' && (e.cost.max ?? 0) > 0)
      errors.push(at('cost.kind is free but cost.max > 0'));

    // Status rules
    if (e.status === 'expected' && !e.expected)
      errors.push(at('status "expected" needs expected.basis and expected.confidence'));
    if (e.status !== 'expected' && e.expected)
      errors.push(at(`"expected" block only belongs on expected events (status is ${e.status})`));
    if (
      e.status === 'confirmed' &&
      !e.sources.some((s) => s.kind === 'official' || s.kind === 'organiser_social')
    )
      errors.push(at('a confirmed event needs at least one official or organiser_social source'));

    // Location
    if (e.format === 'online' && e.location) warnings.push(at('online event has a location'));
    if (
      e.format !== 'online' &&
      e.location &&
      !e.location.latlon &&
      !geocode(e.location.city, e.location.country)
    )
      errors.push(
        at(
          `can't geocode "${e.location.city}, ${e.location.country}": use the city's name as GeoNames spells it, or add location.latlon`,
        ),
      );
    if (e.checks.last_checked < e.added.date)
      errors.push(at('checks.last_checked is before added.date'));

    // Same official URL used by two events of the same year
    if (e.url) {
      const k = `${normaliseUrl(e.url)}|${e.dates.start.slice(0, 4)}`;
      const other = urlOwners.get(k);
      if (other && !isAllowedPair(ds, other, e.id))
        errors.push(at(`same official URL and year as "${other}" (duplicate?)`));
      urlOwners.set(k, e.id);
    }
  }

  // Duplicates by similarity (pairwise; the dataset is small)
  const valid = ds.events.filter(({ doc }) => doc && doc.dates && doc.sources && doc.id);
  const index = valid.map(({ doc }) => indexEntry(doc));
  for (let i = 0; i < valid.length; i++) {
    const e = valid[i]!.doc;
    const others = index.filter((x, j) => j !== i);
    const cand = {
      name: e.name,
      start: e.dates.start,
      end: e.dates.end,
      country: e.location?.country,
      series: e.series,
    };
    for (const m of findSimilar(cand, others)) {
      if (m.score < DUPLICATE_THRESHOLD || isAllowedPair(ds, e.id, m.id) || e.id > m.id) continue;
      errors.push(
        `${valid[i]!.file}: likely duplicate of "${m.id}" (${m.reasons.join(', ')}). If they are different events, add [${[e.id, m.id].sort().join(', ')}] to data/not-duplicates.yaml`,
      );
    }
  }

  return { errors, warnings };
}

function isAllowedPair(ds: Dataset, a: string, b: string): boolean {
  return ds.notDuplicates.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
