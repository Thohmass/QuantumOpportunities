// "Add to calendar": an all-day .ics file for one event (only when the dates are known to the day).
import { addDays, bounds, precisionOf } from './dates';
import type { Ev } from './model';

const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

export function canExportIcs(e: Ev): boolean {
  return (
    precisionOf(e.dates.start) === 'day' && (!e.dates.end || precisionOf(e.dates.end) === 'day')
  );
}

export function eventIcs(e: Ev, pageUrl: string, now = new Date()): string {
  const start = bounds(e.dates.start)[0];
  const end = addDays(bounds(e.dates.end ?? e.dates.start)[1], 1); // DTEND is exclusive
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const where =
    e.format === 'online' ? 'Online' : [e.venue, e.city, e.country].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quantum Opportunities//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@quantum-opportunities`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(start)}`,
    `DTEND;VALUE=DATE:${day(end)}`,
    `SUMMARY:${esc(e.name)}`,
    where ? `LOCATION:${esc(where)}` : '',
    `DESCRIPTION:${esc([e.description, e.url, `Details: ${pageUrl}`].filter(Boolean).join('\n'))}`,
    e.url ? `URL:${e.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}
