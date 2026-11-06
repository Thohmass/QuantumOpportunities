// Reads every file under data/ into memory. Pure I/O; validation lives in validate.ts.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import type { RawEvent, RawOrg, RawSeries, RunLog, TaxonomyItem } from '../../src/lib/types.ts';

export interface FileDoc<T> {
  file: string; // path relative to the repo root
  doc: T;
}

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  kind: string;
  covers?: string[];
  last_scanned?: string;
  scans?: number;
  yield?: number;
  zero_yield_streak?: number;
  note?: string;
}
export interface QueryEntry {
  q: string;
  last_used?: string;
  uses?: number;
  yield?: number;
}
export interface LeadEntry {
  title: string;
  found: string;
  hint: string;
  url?: string;
  tries?: number;
  last_tried?: string;
}

export interface Dataset {
  root: string;
  events: FileDoc<RawEvent>[];
  series: FileDoc<RawSeries>[];
  orgs: FileDoc<RawOrg>[];
  types: TaxonomyItem[];
  topics: TaxonomyItem[];
  audiences: TaxonomyItem[];
  sources: SourceEntry[];
  queries: QueryEntry[];
  leads: LeadEntry[];
  notDuplicates: [string, string][];
  redirects: Record<string, string>;
  runs: RunLog[];
  /** Files that failed to parse as YAML. */
  parseErrors: string[];
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
    else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(p);
  }
  return out;
}

/** YAML 1.2 keeps dates as strings, but a bare year (2027) is a number: normalise it. */
function normaliseEvent(doc: Record<string, unknown>): void {
  const dates = doc.dates as Record<string, unknown> | undefined;
  if (dates)
    for (const k of ['start', 'end']) if (typeof dates[k] === 'number') dates[k] = String(dates[k]);
  if (Array.isArray(doc.deadlines))
    for (const d of doc.deadlines as Record<string, unknown>[])
      if (typeof d.date === 'number') d.date = String(d.date);
}

export function loadDataset(root = process.cwd()): Dataset {
  const dataDir = join(root, 'data');
  const parseErrors: string[] = [];

  function read<T>(path: string, fallback: T): T {
    if (!existsSync(path)) return fallback;
    try {
      const v = parse(readFileSync(path, 'utf8')) as T | null;
      return v ?? fallback;
    } catch (e) {
      parseErrors.push(`${relative(root, path)}: ${(e as Error).message.split('\n')[0]}`);
      return fallback;
    }
  }

  function docs<T>(dir: string): FileDoc<T>[] {
    const out: FileDoc<T>[] = [];
    for (const path of yamlFiles(join(dataDir, dir))) {
      const doc = read<T | null>(path, null);
      if (doc && typeof doc === 'object') out.push({ file: relative(root, path), doc });
      else if (!parseErrors.some((e) => e.startsWith(relative(root, path))))
        parseErrors.push(`${relative(root, path)}: empty or not a mapping`);
    }
    return out;
  }

  const events = docs<RawEvent>('events');
  for (const e of events) normaliseEvent(e.doc as unknown as Record<string, unknown>);

  return {
    root,
    events,
    series: docs<RawSeries>('series'),
    orgs: docs<RawOrg>('orgs'),
    types: read<TaxonomyItem[]>(join(dataDir, 'taxonomy', 'event-types.yaml'), []),
    topics: read<TaxonomyItem[]>(join(dataDir, 'taxonomy', 'topics.yaml'), []),
    audiences: read<TaxonomyItem[]>(join(dataDir, 'taxonomy', 'audiences.yaml'), []),
    sources: read<SourceEntry[]>(join(dataDir, 'sources.yaml'), []),
    queries: read<QueryEntry[]>(join(dataDir, 'queries.yaml'), []),
    leads: read<LeadEntry[]>(join(dataDir, 'leads.yaml'), []),
    notDuplicates: read<[string, string][]>(join(dataDir, 'not-duplicates.yaml'), []),
    redirects: read<Record<string, string>>(join(dataDir, 'redirects.yaml'), {}),
    runs: read<RunLog[]>(join(dataDir, 'runs.yaml'), []),
    parseErrors,
  };
}
