import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from './filters';
import { suggest, type Suggestion } from './suggest';

const pool: Suggestion[] = [
  { key: 'countries', value: 'DE', label: '🇩🇪 Germany', group: 'Country', count: 10 },
  { key: 'cities', value: 'Berlin|DE', label: 'Berlin, DE', group: 'City', count: 2 },
  { key: 'orgs', value: 'bq', label: 'Berlin Quantum', group: 'Organiser', count: 1 },
  { key: 'topics', value: 'qc', label: 'Quantum computing', group: 'Topic', count: 40 },
  { key: 'cities', value: 'Algeria|DZ', label: 'Nigeria town, NG', group: 'City', count: 0 },
  { key: 'cities', value: 'Zürich|CH', label: 'Zürich, CH', group: 'City', count: 3 },
];

describe('suggest', () => {
  it('needs two letters', () => {
    expect(suggest(pool, 'g', DEFAULT_FILTERS)).toEqual([]);
  });
  it('matches the start of the name, ignoring a flag', () => {
    expect(suggest(pool, 'ger', DEFAULT_FILTERS).map((s) => s.value)).toEqual(['DE']);
  });
  it('ranks name starts before word starts, then by count', () => {
    const r = suggest(pool, 'ber', DEFAULT_FILTERS).map((s) => s.value);
    expect(r).toEqual(['Berlin|DE', 'bq']);
    expect(suggest(pool, 'comp', DEFAULT_FILTERS).map((s) => s.value)).toEqual(['qc']);
  });
  it('ignores accents and skips options already selected or without events', () => {
    expect(suggest(pool, 'zur', DEFAULT_FILTERS).map((s) => s.value)).toEqual(['Zürich|CH']);
    expect(suggest(pool, 'ger', { ...DEFAULT_FILTERS, countries: ['DE'] })).toEqual([]);
    expect(suggest(pool, 'nigeria', DEFAULT_FILTERS)).toEqual([]);
  });
});
