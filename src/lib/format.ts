// Display text for event fields. "Not found yet" is the one wording for absent data.
import { daysBetween, formatPartial, formatRange } from './dates';
import { countryName, flag } from './geo';
import type { Ev } from './model';
import type { Meta } from './types';

export const NOT_FOUND = 'Not found yet';

export function whenText(e: Ev): string {
  return formatRange(e.dates.start, e.dates.end);
}

export function whereText(e: Ev): string {
  if (e.format === 'online') return 'Online';
  const place =
    e.city && e.country
      ? `${e.city}, ${countryName(e.country)}`
      : e.country
        ? countryName(e.country)
        : '';
  if (!place) return NOT_FOUND;
  return e.format === 'hybrid' ? `${place} + online` : place;
}

export function flagOf(e: Ev): string {
  return e.country ? flag(e.country) : e.format === 'online' ? '🌐' : '';
}

export function costText(e: Ev): string {
  const c = e.cost;
  if (!c) return NOT_FOUND;
  if (c.kind === 'free') return 'Free';
  const money = (n: number) => (c.currency ? `${n} ${c.currency}` : String(n));
  if (c.min !== undefined && c.max !== undefined)
    return c.min === c.max ? money(c.min) : `${money(c.min)} – ${money(c.max)}`;
  if (c.max !== undefined) return `Up to ${money(c.max)}`;
  return c.kind === 'mixed' ? 'Free or paid' : 'Paid';
}

export function costBadge(e: Ev): 'free' | 'paid' | 'unknown' {
  return !e.cost ? 'unknown' : e.cost.kind === 'free' ? 'free' : 'paid';
}

export function teamText(e: Ev): string | undefined {
  const t = e.team;
  if (t === 'n/a') return undefined;
  if (!t) return NOT_FOUND;
  const size =
    t.min && t.max
      ? t.min === t.max
        ? `${t.min} people`
        : `${t.min}–${t.max} people`
      : t.max
        ? `up to ${t.max}`
        : t.min
          ? `${t.min}+ people`
          : '';
  return [size, t.note].filter(Boolean).join('. ') || NOT_FOUND;
}

export function deadlineText(e: Ev, today: number): string {
  if (e.deadlines === 'n/a') return 'No deadline';
  const d = e.nextDeadline;
  if (d) {
    const n = daysBetween(today, d.day);
    const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
    return `${formatPartial(d.date)} (${when})`;
  }
  if (Array.isArray(e.deadlines) && e.deadlines.length) return 'Closed';
  return NOT_FOUND;
}

export const KIND_LABEL: Record<string, string> = {
  application: 'Applications',
  registration: 'Registration',
  abstract: 'Abstracts / papers',
  early_bird: 'Early bird',
  other: 'Deadline',
};

export function orgName(meta: Meta, id: string): string {
  return meta.orgs[id]?.name ?? id;
}

export function statusLabel(e: Ev): string {
  if (e.status === 'expected') return 'Expected · unconfirmed';
  if (e.status === 'postponed') return 'Postponed';
  if (e.status === 'cancelled') return 'Cancelled';
  if (e.isOngoing) return 'Happening now';
  if (e.isPast) return 'Past';
  return 'Confirmed';
}

export const ORG_TYPE_LABEL: Record<string, string> = {
  university: 'Universities',
  company: 'Companies',
  research_institute: 'Research institutes',
  community: 'Communities & non-profits',
  government: 'Government & intergovernmental',
  other: 'Other organisers',
};

export const FORMAT_LABEL: Record<string, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
};

export function safeUrl(u: string | undefined): string | undefined {
  return u && /^https:\/\//.test(u) ? u : undefined;
}
