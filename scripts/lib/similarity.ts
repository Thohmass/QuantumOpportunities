// Duplicate detection: normalised URLs, trigram name similarity, date overlap, same country.
import { eventSpan, overlaps } from '../../src/lib/dates.ts';
import { fold } from './geocode.ts';

/** Strips scheme, www, trailing slashes, query, hash and index files: "https://www.x.org/a/?q#h" → "x.org/a". */
export function normaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/(index\.html?)?$/i, '').replace(/\/+$/, '');
    return host + path.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

const STOP = new Set(['the', 'of', 'and', 'for', 'in', 'on', 'a', 'an', 'at', 'to', 'x']);

/** Name without years, edition numbers and filler words, for comparing editions of the same thing. */
export function nameKey(name: string): string {
  return fold(name)
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Words too common in event names to identify one on their own. */
const GENERIC = new Set(
  'quantum hackathon hack conference summer winter school workshop challenge computing computer computers international week symposium meeting annual global european world technology technologies science sciences information days day event fest festival program programme'.split(
    ' ',
  ),
);

/**
 * 0–1. The larger of: Dice over character trigrams of the name keys, and (×0.9) how many of the shorter
 * name's distinctive words appear in the longer one — so "Xanadu QHack" matches "QHack", while
 * "Berlin Quantum Hackathon" does not match a generic "Quantum Hackathon".
 */
export function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  const A = trigrams(ka);
  const B = trigrams(kb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const dice = (2 * inter) / (A.size + B.size);
  const wa = new Set(ka.split(' ').filter((w) => !GENERIC.has(w)));
  const wb = new Set(kb.split(' ').filter((w) => !GENERIC.has(w)));
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (!small.size) return dice;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return Math.max(dice, (shared / small.size) * 0.9);
}

export interface IndexEntry {
  id: string;
  series?: string;
  name: string;
  start: string;
  end?: string;
  country?: string;
  city?: string;
  status: string;
  urls: string[];
}

export interface Candidate {
  name: string;
  start?: string;
  end?: string;
  country?: string;
  url?: string;
  series?: string;
}

export interface Match {
  id: string;
  name: string;
  score: number;
  reasons: string[];
}

export const DUPLICATE_THRESHOLD = 0.85;

/** Ranks existing events by how likely they are the same edition as the candidate. */
export function findSimilar(c: Candidate, index: IndexEntry[], limit = 5): Match[] {
  const out: Match[] = [];
  const cUrl = c.url ? normaliseUrl(c.url) : undefined;
  const cSpan = c.start ? eventSpan(c.start, c.end) : undefined;
  for (const e of index) {
    const reasons: string[] = [];
    let score = 0;
    const sim = nameSimilarity(c.name, e.name);
    if (cUrl && e.urls.includes(cUrl)) {
      score = Math.max(score, 0.95);
      reasons.push('same official URL');
    }
    const datesOverlap = cSpan ? overlaps(cSpan, eventSpan(e.start, e.end)) : undefined;
    const sameYear = c.start ? c.start.slice(0, 4) === e.start.slice(0, 4) : undefined;
    if (c.series && e.series === c.series && sameYear) {
      score = Math.max(score, 0.99);
      reasons.push('same series and year');
    }
    if (sim >= 0.5) {
      let s = sim;
      if (datesOverlap === false && sameYear === false) s *= 0.5; // probably another edition
      if (datesOverlap) s = Math.min(1, s + 0.1);
      if (c.country && e.country && c.country !== e.country) s *= 0.7;
      if (s > score) score = s;
      reasons.push(`name ${Math.round(sim * 100)}% similar`);
      if (datesOverlap) reasons.push('dates overlap');
      else if (sameYear) reasons.push('same year');
    }
    if (score >= 0.4)
      out.push({ id: e.id, name: e.name, score: Math.round(score * 100) / 100, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
