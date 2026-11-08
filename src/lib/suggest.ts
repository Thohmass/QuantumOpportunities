// Search suggestions: while typing, offer the filter options whose name matches ("Ger" → Germany), so a search
// can become an exact filter instead of free text. Pure functions, unit-tested.
import type { FacetKey, Filters } from './filters';
import { FORMAT_LABEL, ORG_TYPE_LABEL } from './format';
import { CONTINENT_NAMES, countryName, flag } from './geo';
import type { Meta } from './types';

export interface Suggestion {
  key: FacetKey;
  value: string;
  /** What the option is called (as in the filters). */
  label: string;
  /** Which filter it belongs to, e.g. "Country". */
  group: string;
  /** Matching events right now. */
  count: number;
}

const GROUP: Partial<Record<FacetKey, string>> = {
  types: 'Event type',
  topics: 'Topic',
  formats: 'Format',
  continents: 'Continent',
  countries: 'Country',
  cities: 'City',
  orgTypes: 'Organiser type',
  orgs: 'Organiser',
  audience: "Who it's for",
};

/** Every filter option that exists in the data, with its label and current count. */
export function suggestionPool(
  meta: Meta,
  universe: Record<FacetKey, Set<string>>,
  counts: Record<FacetKey, Map<string, number>>,
): Suggestion[] {
  const name = (key: FacetKey, v: string): string | undefined => {
    switch (key) {
      case 'types':
        return meta.types.find((t) => t.id === v)?.name;
      case 'topics':
        return meta.topics.find((t) => t.id === v)?.name;
      case 'audience':
        return meta.audiences.find((t) => t.id === v)?.name;
      case 'formats':
        return FORMAT_LABEL[v as keyof typeof FORMAT_LABEL];
      case 'continents':
        return v === 'online' ? 'Online only' : CONTINENT_NAMES[v as keyof typeof CONTINENT_NAMES];
      case 'countries':
        return `${flag(v)} ${countryName(v)}`.trim();
      case 'cities': {
        const [city, cc] = v.split('|');
        return `${city}, ${cc}`;
      }
      case 'orgTypes':
        return ORG_TYPE_LABEL[v as keyof typeof ORG_TYPE_LABEL];
      case 'orgs':
        return meta.orgs[v]?.name;
      default:
        return undefined;
    }
  };
  const out: Suggestion[] = [];
  for (const key of Object.keys(GROUP) as FacetKey[]) {
    for (const value of universe[key] ?? []) {
      const label = name(key, value);
      if (label)
        out.push({ key, value, label, group: GROUP[key]!, count: counts[key]?.get(value) ?? 0 });
    }
  }
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The best options for the typed text: names starting with it first, then a word starting with it, then names
 * containing it; options already selected or without matching events are left out.
 */
export function suggest(
  pool: readonly Suggestion[],
  text: string,
  filters: Filters,
  limit = 8,
): Suggestion[] {
  const q = fold(text.trim());
  if (q.length < 2) return [];
  const scored: [number, Suggestion][] = [];
  for (const s of pool) {
    if (s.count === 0 || (filters[s.key] as string[]).includes(s.value)) continue;
    // Ignore a leading flag emoji when matching.
    const label = fold(s.label.replace(/^\p{Regional_Indicator}{2}\s*/u, ''));
    let rank = -1;
    if (label.startsWith(q)) rank = 0;
    else if (label.split(/[\s,()–-]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (label.includes(q)) rank = 2;
    if (rank >= 0) scored.push([rank, s]);
  }
  scored.sort(
    (a, b) => a[0] - b[0] || b[1].count - a[1].count || a[1].label.localeCompare(b[1].label),
  );
  return scored.slice(0, limit).map(([, s]) => s);
}
