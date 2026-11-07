// Client-side view of an event: the built JSON plus fields that depend on today's date.
import { bounds, eventSpan, isoDay } from './dates';
import type { Deadline, EventOut, Meta } from './types';

export type RegState = 'open' | 'closing' | 'closed' | 'none' | 'unknown';

export interface Ev extends EventOut {
  /** First and last day (UTC ms) of the event. */
  span: [number, number];
  isPast: boolean;
  isOngoing: boolean;
  /** Next deadline still ahead (application/registration/abstract/early-bird). */
  nextDeadline?: Deadline & { day: number };
  /** The date that matters next: the next open deadline, else the start. */
  keyDay: number;
  reg: RegState;
  /** Lower-case haystack of organiser names, for search. */
  orgNames: string[];
}

const CLOSING_DAYS = 14;

export function enrich(e: EventOut, meta: Meta, today: number): Ev {
  const span = eventSpan(e.dates.start, e.dates.end);
  const deadlines = Array.isArray(e.deadlines) ? e.deadlines : [];
  const upcoming = deadlines
    .map((d) => ({ ...d, day: bounds(d.date)[1] }))
    .filter((d) => d.day >= today)
    .sort((a, b) => a.day - b.day);
  const next = upcoming[0];
  let reg: RegState = 'unknown';
  if (e.deadlines === 'n/a') reg = 'none';
  else if (next) reg = next.day - today <= CLOSING_DAYS * 86_400_000 ? 'closing' : 'open';
  else if (deadlines.length) reg = 'closed';
  return {
    ...e,
    span,
    isPast: span[1] < today,
    isOngoing: span[0] <= today && today <= span[1],
    ...(next ? { nextDeadline: next } : {}),
    keyDay: next && next.day < span[0] ? next.day : span[0],
    reg,
    orgNames: [...(e.organizers ?? []), ...(e.partners ?? [])].map(
      (id) => meta.orgs[id]?.name ?? id,
    ),
  };
}

export function localToday(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function todayIso(today: number): string {
  return isoDay(today);
}
