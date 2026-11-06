// App state ⇄ URL hash: "#/map?type=hackathon,conference&country=DK&e=qip-2027".
// Only values that differ from the defaults are written, so URLs stay short and readable.
import { DEFAULT_FILTERS, type Filters, type View } from './filters';

export interface Route {
  view: View;
  filters: Filters;
  event?: string;
}

const LISTS: [keyof Filters, string][] = [
  ['types', 'type'],
  ['topics', 'topic'],
  ['formats', 'format'],
  ['continents', 'cont'],
  ['countries', 'country'],
  ['cities', 'city'],
  ['orgTypes', 'orgtype'],
  ['orgs', 'org'],
  ['cost', 'cost'],
  ['audience', 'aud'],
];
const FLAGS: [keyof Filters, string][] = [
  ['travel', 'travel'],
  ['realQpu', 'qpu'],
  ['showExpected', 'expected'],
  ['showPast', 'past'],
  ['showCancelled', 'cancelled'],
  ['byDeadline', 'bydl'],
];
const STRINGS: [keyof Filters, string][] = [
  ['q', 'q'],
  ['when', 'when'],
  ['from', 'from'],
  ['to', 'to'],
  ['deadline', 'dl'],
  ['sort', 'sort'],
];
const VIEWS: View[] = ['explore', 'list', 'timeline', 'map', 'about'];

export function toHash(r: Route): string {
  const p = new URLSearchParams();
  const f = r.filters as unknown as Record<string, unknown>;
  const d = DEFAULT_FILTERS as unknown as Record<string, unknown>;
  for (const [k, name] of STRINGS) if (f[k] !== d[k]) p.set(name, String(f[k]));
  for (const [k, name] of LISTS) {
    const v = f[k] as string[];
    if (v.length) p.set(name, v.join(','));
  }
  for (const [k, name] of FLAGS) if (f[k] !== d[k]) p.set(name, f[k] ? '1' : '0');
  if (r.event) p.set('e', r.event);
  const qs = p.toString().replace(/%2C/g, ',').replace(/%7C/g, '|');
  return `#/${r.view}${qs ? '?' + qs : ''}`;
}

export function fromHash(hash: string, fallbackView: View = 'list'): Route {
  const m = /^#\/?([a-z]*)(?:\?(.*))?$/.exec(hash);
  const view = (VIEWS as string[]).includes(m?.[1] ?? '') ? (m![1] as View) : fallbackView;
  const p = new URLSearchParams(m?.[2] ?? '');
  const filters: Filters = { ...DEFAULT_FILTERS };
  const f = filters as unknown as Record<string, unknown>;
  for (const [k, name] of STRINGS) {
    const v = p.get(name);
    if (v !== null) f[k] = v;
  }
  for (const [k, name] of LISTS) {
    const v = p.get(name);
    if (v) f[k] = v.split(',').filter(Boolean);
  }
  for (const [k, name] of FLAGS) {
    const v = p.get(name);
    if (v !== null) f[k] = v === '1';
  }
  // Guard against hand-edited URLs with unknown enum values.
  if (!['any', '30d', '3m', 'thisyear', 'nextyear', 'custom'].includes(filters.when))
    filters.when = 'any';
  if (!['any', 'open', '2w'].includes(filters.deadline)) filters.deadline = 'any';
  if (!['date', 'start', 'added', 'updated'].includes(filters.sort)) filters.sort = 'date';
  const event = p.get('e') ?? undefined;
  return { view, filters, ...(event ? { event } : {}) };
}
