// Partial dates: "2027", "2027-06" or "2027-06-14". All maths is in UTC days to avoid timezone drift.

export type Precision = 'year' | 'month' | 'day';

const DAY = 86_400_000;

export function precisionOf(d: string): Precision {
  return d.length === 4 ? 'year' : d.length === 7 ? 'month' : 'day';
}

/** First and last calendar day (UTC ms) covered by a partial date. */
export function bounds(d: string): [number, number] {
  const y = Number(d.slice(0, 4));
  const p = precisionOf(d);
  if (p === 'year') return [Date.UTC(y, 0, 1), Date.UTC(y, 11, 31)];
  const m = Number(d.slice(5, 7)) - 1;
  if (p === 'month') return [Date.UTC(y, m, 1), Date.UTC(y, m + 1, 0)];
  const t = Date.UTC(y, m, Number(d.slice(8, 10)));
  return [t, t];
}

/** Earliest and latest day of an event: start of its start to end of its end (or of its start). */
export function eventSpan(start: string, end?: string): [number, number] {
  return [bounds(start)[0], bounds(end ?? start)[1]];
}

export function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayUTC(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function parseDay(iso: string): number {
  return bounds(iso)[0];
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / DAY);
}

export function addDays(ms: number, n: number): number {
  return ms + n * DAY;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[m] ?? '';
}

/** Human date for a partial date: "2027", "June 2027", "14 Jun 2027". */
export function formatPartial(d: string, withYear = true): string {
  const p = precisionOf(d);
  const y = d.slice(0, 4);
  if (p === 'year') return y;
  const m = Number(d.slice(5, 7)) - 1;
  if (p === 'month') return `${monthName(m, true)}${withYear ? ' ' + y : ''}`;
  return `${Number(d.slice(8, 10))} ${monthName(m)}${withYear ? ' ' + y : ''}`;
}

/** Human date range, collapsing shared month/year: "12–14 Mar 2027", "28 Feb – 2 Mar 2027". */
export function formatRange(start: string, end?: string): string {
  if (!end || end === start) return formatPartial(start);
  const ps = precisionOf(start);
  const pe = precisionOf(end);
  if (ps === 'day' && pe === 'day') {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
    if (sameMonth) return `${Number(start.slice(8, 10))}–${formatPartial(end)}`;
    if (sameYear) return `${formatPartial(start, false)} – ${formatPartial(end)}`;
  }
  if (ps === 'month' && pe === 'month' && start.slice(0, 4) === end.slice(0, 4)) {
    return `${monthName(Number(start.slice(5, 7)) - 1)}–${monthName(Number(end.slice(5, 7)) - 1)} ${end.slice(0, 4)}`;
  }
  return `${formatPartial(start)} – ${formatPartial(end)}`;
}
