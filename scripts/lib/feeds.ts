// Reads machine-readable event feeds (iCal, RSS and Atom) for the Scout's prep step, issue #42.
// Pure parsing and filtering; scout-prep.ts does the fetching. No dependency: the formats are simple enough.

export type FeedFormat = 'ical' | 'rss';

export interface FeedItem {
  title: string;
  url?: string;
  /** YYYY-MM-DD for calendar events; publication day for RSS items. */
  start?: string;
  end?: string;
  location?: string;
  summary?: string;
  /** RSS items are announcements (published), iCal items are events (start/end). */
  kind: 'event' | 'post';
}

// ---------- iCal (RFC 5545) ----------

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function unescapeIcal(v: string): string {
  return v
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

/** 20270415, 20270415T090000Z or 20270415T090000 → 2027-04-15 (the calendar day as written). */
function icalDay(v: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined; // groups always match when m does
}

function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function parseIcal(text: string): FeedItem[] {
  const items: FeedItem[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur?.SUMMARY) {
        const start = cur.DTSTART ? icalDay(cur.DTSTART.value) : undefined;
        let end = cur.DTEND ? icalDay(cur.DTEND.value) : undefined;
        // A date-only DTEND is exclusive: an event on 14–16 April ends with DTEND 20270417.
        if (end && cur.DTEND?.params.includes('VALUE=DATE') && end !== start)
          end = previousDay(end);
        items.push({
          kind: 'event',
          title: unescapeIcal(cur.SUMMARY.value),
          url: cur.URL ? unescapeIcal(cur.URL.value) : undefined,
          start,
          end: end && start && end < start ? start : end,
          location: cur.LOCATION ? unescapeIcal(cur.LOCATION.value) || undefined : undefined,
          summary: cur.DESCRIPTION ? unescapeIcal(cur.DESCRIPTION.value).slice(0, 300) : undefined,
        });
      }
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(';');
      cur[(name ?? '').toUpperCase()] = {
        value: line.slice(colon + 1),
        params: params.join(';').toUpperCase(),
      };
    }
  }
  return items;
}

// ---------- RSS 2.0 and Atom ----------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e.startsWith('#')) {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Element text: CDATA unwrapped, entities decoded, HTML tags removed, whitespace collapsed. */
function textOf(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return undefined;
  const raw = (m[1] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const text = decodeEntities(decodeEntities(raw).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/** Google Alerts wraps every link as https://www.google.com/url?…&url=<real link>&…; unwrap it. */
export function unwrapLink(href: string): string {
  try {
    const u = new URL(href);
    if (u.hostname.endsWith('google.com') && u.pathname === '/url') {
      return u.searchParams.get('url') ?? u.searchParams.get('q') ?? href;
    }
  } catch {
    /* not a URL: keep as is */
  }
  return href;
}

function dayOf(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

export function parseRss(xml: string): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];
  const items: FeedItem[] = [];
  for (const [, body = ''] of blocks) {
    const title = textOf(body, 'title');
    if (!title) continue;
    const atomHref = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(body)?.[1];
    const link = atomHref ? decodeEntities(atomHref) : textOf(body, 'link');
    items.push({
      kind: 'post',
      title,
      url: link ? unwrapLink(link) : undefined,
      start: dayOf(textOf(body, 'pubDate') ?? textOf(body, 'published') ?? textOf(body, 'updated')),
      summary: (
        textOf(body, 'description') ??
        textOf(body, 'summary') ??
        textOf(body, 'content')
      )?.slice(0, 300),
    });
  }
  return items;
}

export function parseFeed(format: FeedFormat, text: string): FeedItem[] {
  return format === 'ical' ? parseIcal(text) : parseRss(text);
}

// ---------- Filtering ----------

const QUANTUM = /quantum|qubit|qiskit|pennylane|cirq|\bqml\b|\bqec\b|kvant/i;

export function isQuantum(item: FeedItem): boolean {
  return QUANTUM.test(item.title) || QUANTUM.test(item.summary ?? '');
}

/**
 * Keeps what the Scout should look at: quantum-related, and either an event that hasn't ended yet or a post
 * published in the last `postDays` days. Calendar-only feeds about quantum (`allQuantum`) skip the keyword test.
 */
export function relevant(
  items: FeedItem[],
  today: string,
  opts: { allQuantum?: boolean; postDays?: number } = {},
): FeedItem[] {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - (opts.postDays ?? 14));
  const sinceDay = since.toISOString().slice(0, 10);
  return items.filter((it) => {
    if (!opts.allQuantum && !isQuantum(it)) return false;
    if (it.kind === 'event') return (it.end ?? it.start ?? today) >= today;
    return !it.start || it.start >= sinceDay;
  });
}

// ---------- robots.txt ----------

/** True when robots.txt lets any crawler (`User-agent: *`) fetch `path`. Longest matching rule wins. */
export function robotsAllows(robots: string, path: string): boolean {
  let applies = false;
  let inGroupHeader = false;
  const rules: { allow: boolean; prefix: string }[] = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim();
    if (key === 'user-agent') {
      if (!inGroupHeader) applies = false;
      inGroupHeader = true;
      if (value === '*') applies = true;
      continue;
    }
    inGroupHeader = false;
    if (!applies || (key !== 'allow' && key !== 'disallow') || value === '') continue;
    rules.push({ allow: key === 'allow', prefix: value.replace(/\*$/, '') });
  }
  let best: { allow: boolean; prefix: string } | undefined;
  for (const r of rules) {
    if (path.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best ? best.allow : true;
}
