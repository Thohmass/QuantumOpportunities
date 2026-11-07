// Build-time geocoding from city + country, using the GeoNames cities dataset (all-the-cities, CC BY).
// Agents never type coordinates; a `latlon` override in the event file wins when the lookup can't help.
import { createRequire } from 'node:module';

interface City {
  name: string;
  altName: string;
  country: string;
  population: number;
  loc: { coordinates: [number, number] };
}

export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let index: Map<string, [number, number, number]> | undefined;

function buildIndex(): Map<string, [number, number, number]> {
  const require = createRequire(import.meta.url);
  const cities = require('all-the-cities') as City[];
  const map = new Map<string, [number, number, number]>();
  const add = (name: string, c: City) => {
    const key = `${fold(name)}|${c.country}`;
    const prev = map.get(key);
    if (!prev || prev[2] < c.population)
      map.set(key, [c.loc.coordinates[1], c.loc.coordinates[0], c.population]);
  };
  for (const c of cities) {
    add(c.name, c);
    // "Donostia / San Sebastián" → both halves
    if (c.name.includes('/')) for (const part of c.name.split('/')) add(part, c);
    for (const alt of c.altName ? c.altName.split(',') : []) if (alt.trim()) add(alt, c);
  }
  return map;
}

/** Common English exonyms and short forms missing from the dataset. Lower-case folded keys. */
const ALIASES: Record<string, string> = {
  'gothenburg|SE': 'goteborg',
  'lyngby|DK': 'kongens lyngby',
  'kgs lyngby|DK': 'kongens lyngby',
  'garching|DE': 'garching bei munchen',
  'munich|DE': 'munchen',
  'cologne|DE': 'koln',
  'tumakuru|IN': 'tumkur',
  'bengaluru|IN': 'bangalore',
  'delft|NL': 'delft',
  'the hague|NL': 'den haag',
  'prague|CZ': 'praha',
  'vienna|AT': 'wien',
  'rome|IT': 'roma',
  'milan|IT': 'milano',
  'lisbon|PT': 'lisboa',
  'warsaw|PL': 'warszawa',
  'brussels|BE': 'brussel',
  'copenhagen|DK': 'copenhagen',
  'new york|US': 'new york city',
  'washington dc|US': 'washington',
  'washington d c|US': 'washington',
};

export function geocode(city: string, country: string): [number, number] | undefined {
  index ??= buildIndex();
  const key = `${fold(city)}|${country}`;
  const hit = index.get(key) ?? index.get(`${ALIASES[key] ?? ''}|${country}`);
  return hit ? [hit[0], hit[1]] : undefined;
}
