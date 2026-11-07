// Date selections as a set of day intervals ("2027-01-01~2027-01-31"), so a selection can have gaps
// (January + March). All operations return a normalised list: sorted, merged where they touch.
import { addDays, bounds, isoDay } from './dates';

export type Interval = [number, number]; // inclusive UTC-day bounds

const DAY = 86_400_000;

export function parseRange(s: string): Interval | undefined {
  const [a, b] = s.split('~');
  if (!a || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(a)) return undefined;
  const end = b && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(b) ? b : a;
  const iv: Interval = [bounds(a)[0], bounds(end)[1]];
  return iv[1] < iv[0] ? [iv[1], iv[0]] : iv;
}

export function formatRangeKey([a, b]: Interval): string {
  return `${isoDay(a)}~${isoDay(b)}`;
}

export function toIntervals(ranges: string[]): Interval[] {
  return normalise(ranges.map(parseRange).filter((x): x is Interval => !!x));
}

export function normalise(list: Interval[]): Interval[] {
  const sorted = [...list].sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + DAY) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

export function union(list: Interval[], add: Interval): Interval[] {
  return normalise([...list, add]);
}

export function subtract(list: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (cut[1] < a || cut[0] > b) out.push([a, b]);
    else {
      if (cut[0] > a) out.push([a, addDays(cut[0], -1)]);
      if (cut[1] < b) out.push([addDays(cut[1], 1), b]);
    }
  }
  return out;
}

/** True when the whole interval is inside the selection. */
export function covers(list: Interval[], iv: Interval): boolean {
  return list.some(([a, b]) => a <= iv[0] && iv[1] <= b);
}

export function overlapsAny(list: Interval[], a: number, b: number): boolean {
  return list.some(([x, y]) => a <= y && x <= b);
}

export type ClickMode = 'plain' | 'toggle' | 'extend';

/**
 * File-manager selection for a clicked period:
 * - plain: if the period is selected, remove it; otherwise select only it.
 * - toggle (Ctrl/Cmd): add or remove the period, keeping the rest.
 * - extend (Shift): select everything from the anchor period to this one (replacing the rest).
 */
export function clickSelect(
  list: Interval[],
  iv: Interval,
  mode: ClickMode,
  anchor?: Interval,
): Interval[] {
  if (mode === 'extend' && anchor)
    return [[Math.min(anchor[0], iv[0]), Math.max(anchor[1], iv[1])]];
  const selected = covers(list, iv);
  if (mode === 'toggle') return selected ? subtract(list, iv) : union(list, iv);
  if (selected) return subtract(list, iv);
  return [iv];
}
