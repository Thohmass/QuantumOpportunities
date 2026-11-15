import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedCandidates, PER_FEED } from './feed-candidates.ts';
import { isQuantum, parseIcal, parseRss, relevant, robotsAllows, unwrapLink } from './feeds.ts';
import { loadDataset, type SourceEntry } from './load.ts';
import { validateDataset } from './validate.ts';
import type { IndexEntry } from './similarity.ts';

const fixture = (name: string) => readFileSync(`scripts/fixtures/feeds/${name}`, 'utf8');
const TODAY = '2026-11-15';

describe('parseIcal', () => {
  const items = parseIcal(fixture('calendar.ics'));

  it('reads every event with its fields, unfolded and unescaped', () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      kind: 'event',
      title: 'Nordic Quantum Hackathon 2027',
      url: 'https://example.org/nqh-2027/',
      location: 'DTU, Kongens Lyngby, Denmark',
      start: '2027-04-14',
    });
    expect(items[0]!.summary).toContain('folded onto the next one');
  });

  it('treats a date-only DTEND as exclusive', () => {
    expect(items[0]!.end).toBe('2027-04-16');
    expect(items[2]).toMatchObject({ start: '2026-03-01', end: '2026-03-01' });
  });

  it('keeps the calendar day of a timed event', () => {
    expect(items[1]).toMatchObject({ start: '2026-12-01', end: '2026-12-01' });
  });
});

describe('parseRss', () => {
  it('reads Atom entries and unwraps Google Alerts links and markup', () => {
    const first = parseRss(fixture('alerts.xml'))[0]!;
    expect(first).toMatchObject({
      kind: 'post',
      title: 'Students invited to the Quantum Hackathon in Lisbon',
      url: 'https://example.org/lisbon-qhack',
      start: '2026-11-13',
    });
    expect(first.summary).toBe(
      'Registration is open for a 48-hour quantum hackathon & summer camp.',
    );
  });

  it('reads RSS items with CDATA and entities', () => {
    const items = parseRss(fixture('newsletter.xml'));
    expect(items.map((i) => i.title)).toEqual([
      'Roundup #40: iQuHACK registration, qubit schools',
      'Cooking with cast iron',
    ]);
    expect(items[0]).toMatchObject({
      url: 'https://example.substack.com/p/roundup-40',
      start: '2026-11-12',
    });
    expect(items[0]!.summary).toBe('Student opportunities this week…');
  });

  it('leaves ordinary links alone', () => {
    expect(unwrapLink('https://example.org/a?url=b')).toBe('https://example.org/a?url=b');
  });
});

describe('relevant', () => {
  it('keeps quantum events that have not ended and recent quantum posts', () => {
    const events = relevant(parseIcal(fixture('calendar.ics')), TODAY).map((i) => i.title);
    expect(events).toEqual(['Nordic Quantum Hackathon 2027', 'QHack 2027']);
    const posts = relevant(parseRss(fixture('alerts.xml')), TODAY).map((i) => i.title);
    expect(posts).toEqual(['Students invited to the Quantum Hackathon in Lisbon']);
  });

  it('skips the keyword test for all-quantum feeds', () => {
    const titles = relevant(parseIcal(fixture('calendar.ics')), TODAY, { allQuantum: true }).map(
      (i) => i.title,
    );
    expect(titles).toContain('Laser World of Photonics');
  });

  it('recognises quantum words in the summary too', () => {
    expect(isQuantum({ kind: 'post', title: 'Roundup', summary: 'new Qiskit challenge' })).toBe(
      true,
    );
    expect(isQuantum({ kind: 'post', title: 'Cooking' })).toBe(false);
  });
});

describe('robotsAllows', () => {
  const robots = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /export/\nAllow: /export/public/\n`;
  it('follows the rules for every crawler, longest match first', () => {
    expect(robotsAllows(robots, '/export/categ/1.ics')).toBe(false);
    expect(robotsAllows(robots, '/export/public/a.ics')).toBe(true);
    expect(robotsAllows(robots, '/events/')).toBe(true);
    expect(robotsAllows('', '/anything')).toBe(true);
  });
});

describe('feedCandidates', () => {
  const qhack: IndexEntry = {
    id: 'qhack-2027',
    series: 'qhack',
    name: 'QHack 2027',
    start: '2027-10-15',
    end: '2027-10-22',
    urls: ['https://qhack.ai/'],
  } as IndexEntry;
  const files: Record<string, string> = {
    'https://cal.example/events.ics': fixture('calendar.ics'),
    'https://alerts.example/feed': fixture('alerts.xml'),
  };
  const io = {
    get: async (url: string) => {
      if (!(url in files)) throw new Error('HTTP 404');
      return files[url]!;
    },
    robots: async (url: string) => (url.includes('blocked') ? 'User-agent: *\nDisallow: /\n' : ''),
  };
  const source = (id: string, url: string, format: 'ical' | 'rss'): SourceEntry => ({
    id,
    name: id,
    url,
    kind: 'aggregator',
    feed: { format, url },
  });

  it('lists new items per source and drops events we already have', async () => {
    const lines = await feedCandidates(
      [
        source('cal', 'https://cal.example/events.ics', 'ical'),
        source('alerts', 'https://alerts.example/feed', 'rss'),
      ],
      [qhack],
      TODAY,
      io,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'cal | Nordic Quantum Hackathon 2027 | 2027-04-14–2027-04-16 | DTU, Kongens Lyngby, Denmark | https://example.org/nqh-2027/',
      'alerts | Students invited to the Quantum Hackathon in Lisbon | posted 2026-11-13 |  | https://example.org/lisbon-qhack',
    ]);
  });

  it('reports fetch errors and robots.txt refusals instead of failing', async () => {
    const lines = await feedCandidates(
      [
        source('gone', 'https://gone.example/x.ics', 'ical'),
        source('no', 'https://blocked.example/x.ics', 'ical'),
      ],
      [],
      TODAY,
      io,
    );
    expect(lines.every((l) => l.error)).toBe(true);
    expect(lines[0]!.text).toContain('ERROR: HTTP 404');
    expect(lines[1]!.text).toContain('SKIPPED: robots.txt');
  });

  it('caps the items per feed', async () => {
    const many =
      'BEGIN:VCALENDAR\n' +
      Array.from(
        { length: 40 },
        (_, i) =>
          `BEGIN:VEVENT\nDTSTART;VALUE=DATE:2027050${i % 9}\nSUMMARY:Quantum school ${i}\nEND:VEVENT\n`,
      ).join('') +
      'END:VCALENDAR\n';
    const lines = await feedCandidates(
      [source('many', 'https://many.example/x.ics', 'ical')],
      [],
      TODAY,
      { get: async () => many, robots: async () => '' },
    );
    expect(lines).toHaveLength(PER_FEED);
  });
});

describe('feed field in data/sources.yaml', () => {
  function validate(sources: string): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'qo-feed-'));
    cpSync('schema', join(dir, 'schema'), { recursive: true });
    cpSync('data/taxonomy', join(dir, 'data/taxonomy'), { recursive: true });
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data/sources.yaml'), sources);
    const errors = validateDataset(loadDataset(dir)).errors;
    rmSync(dir, { recursive: true });
    return errors;
  }
  const entry = (feed: string) =>
    `- id: cal\n  name: Cal\n  url: https://cal.example/\n  kind: aggregator\n  feed:\n${feed}`;

  it('accepts an iCal or RSS feed with an https URL', () => {
    expect(
      validate(
        entry('    format: ical\n    url: https://cal.example/x.ics\n    all_quantum: true\n'),
      ),
    ).toEqual([]);
    expect(validate(entry('    format: rss\n    url: https://cal.example/feed\n'))).toEqual([]);
  });

  it('rejects unknown formats, plain http and missing URLs', () => {
    expect(validate(entry('    format: json\n    url: https://cal.example/x\n'))).not.toEqual([]);
    expect(validate(entry('    format: rss\n    url: http://cal.example/feed\n'))).not.toEqual([]);
    expect(validate(entry('    format: rss\n'))).not.toEqual([]);
  });
});
