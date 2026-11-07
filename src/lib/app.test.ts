import { describe, expect, it } from 'vitest';
import { parseDay } from './dates';
import { formatRange, formatPartial } from './dates';
import {
  DEFAULT_FILTERS,
  activeCount,
  applyFilters,
  facetCounts,
  sortEvents,
  topicTree,
  type Ctx,
  type Filters,
} from './filters';
import { costText, deadlineText, whereText } from './format';
import { canExportIcs, eventIcs } from './ics';
import { enrich, type Ev } from './model';
import { buildIndex, search } from './search';
import type { EventOut, Meta } from './types';
import { fromHash, toHash } from './url';

const today = parseDay('2026-11-06');
const meta: Meta = {
  generatedAt: '2026-11-06T00:00:00Z',
  types: [
    { id: 'hackathon', name: 'Hackathon' },
    { id: 'conference', name: 'Conference' },
    { id: 'summer_school', name: 'Summer school' },
  ],
  topics: [
    { id: 'computing', name: 'Quantum computing' },
    { id: 'qec', name: 'Error correction', parent: 'computing' },
    { id: 'communication', name: 'Quantum communication' },
  ],
  audiences: [{ id: 'msc', name: "Master's" }],
  orgs: { mit: { name: 'MIT', type: 'university' }, xanadu: { name: 'Xanadu', type: 'company' } },
  series: {},
  redirects: {},
  health: { total: 0, byStatus: {}, filled: {}, lastRuns: {} },
};

const raw = (o: Partial<EventOut> & Pick<EventOut, 'id' | 'name' | 'dates'>): EventOut => ({
  type: 'hackathon',
  status: 'confirmed',
  format: 'in_person',
  sources: [],
  lastChecked: '2026-11-01',
  addedOn: '2026-11-01',
  missing: [],
  ...o,
});

const events: Ev[] = [
  raw({
    id: 'iquhack',
    name: 'MIT iQuHACK 2027',
    dates: { start: '2027-01-29', end: '2027-01-31' },
    deadlines: [{ kind: 'application', date: '2026-11-18' }],
    city: 'Cambridge',
    country: 'US',
    continent: 'NA',
    organizers: ['mit'],
    topics: ['qec'],
    cost: { kind: 'free' },
    audience: ['msc'],
    support: { travel_grants: true },
  }),
  raw({
    id: 'qhack',
    name: 'QHack 2027',
    status: 'expected',
    format: 'online',
    dates: { start: '2027-10' },
    organizers: ['xanadu'],
    topics: ['computing'],
  }),
  raw({
    id: 'qcrypt',
    name: 'QCrypt 2027',
    type: 'conference',
    dates: { start: '2027-08-23', end: '2027-08-27' },
    city: 'Vienna',
    country: 'AT',
    continent: 'EU',
    topics: ['communication'],
    cost: { kind: 'paid', min: 300, max: 500, currency: 'EUR' },
  }),
  raw({
    id: 'old',
    name: 'Old Hack 2025',
    dates: { start: '2025-05-01' },
    city: 'Oslo',
    country: 'NO',
    continent: 'EU',
  }),
].map((e) => enrich(e, meta, today));

const ctx = (q = ''): Ctx => {
  const ms = buildIndex(events, meta);
  return { meta, today, topicTree: topicTree(meta), searchHits: search(ms, q) };
};
const run = (f: Partial<Filters>, q = '') =>
  applyFilters(events, { ...DEFAULT_FILTERS, ...f, q }, ctx(q)).map((e) => e.id);

describe('model', () => {
  it('derives registration state and key dates', () => {
    const iq = events[0]!;
    expect(iq.reg).toBe('closing'); // 12 days left
    expect(iq.nextDeadline?.date).toBe('2026-11-18');
    expect(iq.keyDay).toBe(parseDay('2026-11-18'));
    expect(events[3]!.isPast).toBe(true);
  });
});

describe('filters', () => {
  it('hides past events by default and shows them on request', () => {
    expect(run({})).not.toContain('old');
    expect(run({ showPast: true })).toContain('old');
  });
  it('can hide unconfirmed events', () => {
    expect(run({ showExpected: false })).not.toContain('qhack');
  });
  it('filters by facets, with parent topics including children', () => {
    expect(run({ types: ['conference'] })).toEqual(['qcrypt']);
    expect(run({ topics: ['computing'] }).sort()).toEqual(['iquhack', 'qhack']);
    expect(run({ continents: ['online'] })).toEqual(['qhack']);
    expect(run({ orgTypes: ['company'] })).toEqual(['qhack']);
    expect(run({ cost: ['unknown'] })).toEqual(['qhack']);
    expect(run({ audience: ['unknown'] }).sort()).toEqual(['qcrypt', 'qhack']);
    expect(run({ travel: true })).toEqual(['iquhack']);
  });
  it('filters by date, optionally matching deadlines', () => {
    expect(run({ when: '30d' })).toEqual([]);
    expect(run({ when: '30d', byDeadline: true })).toEqual(['iquhack']);
    expect(run({ when: 'custom', from: '2027-08', to: '2027-12' }).sort()).toEqual([
      'qcrypt',
      'qhack',
    ]);
    expect(run({ deadline: '2w' })).toEqual(['iquhack']);
  });
  it('searches with prefixes and typos', () => {
    expect(run({}, 'iquh')).toEqual(['iquhack']);
    expect(run({}, 'vienna')).toEqual(['qcrypt']);
    expect(run({}, 'xanadu')).toEqual(['qhack']);
  });
  it('counts facet options without the facet itself', () => {
    const c = facetCounts(events, { ...DEFAULT_FILTERS, types: ['conference'] }, ctx());
    expect(c.types.get('hackathon')).toBe(2);
    expect(c.continents.get('EU')).toBe(1);
    expect(c.topics.get('computing')).toBeUndefined();
  });
  it('sorts by next relevant date', () => {
    expect(sortEvents(events, 'date').map((e) => e.id)).toEqual([
      'iquhack',
      'qcrypt',
      'qhack',
      'old',
    ]);
  });
  it('counts active filters', () => {
    expect(activeCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeCount({ ...DEFAULT_FILTERS, types: ['a', 'b'], showPast: true })).toBe(3);
  });
});

describe('url', () => {
  it('round-trips state and omits defaults', () => {
    expect(toHash({ view: 'list', filters: DEFAULT_FILTERS })).toBe('#/list');
    const f: Filters = {
      ...DEFAULT_FILTERS,
      q: 'qec hack',
      types: ['hackathon', 'conference'],
      cities: ['Copenhagen|DK'],
      showExpected: false,
      when: 'custom',
      from: '2027-01',
    };
    const hash = toHash({ view: 'map', filters: f, event: 'qip-2027' });
    expect(hash).toContain('type=hackathon,conference');
    expect(fromHash(hash)).toEqual({ view: 'map', filters: f, event: 'qip-2027' });
  });
  it('survives junk', () => {
    expect(fromHash('#/nope?when=never&sort=x').filters).toEqual(DEFAULT_FILTERS);
    expect(fromHash('').view).toBe('list');
  });
});

describe('format', () => {
  it('formats dates honestly', () => {
    expect(formatRange('2027-01-29', '2027-01-31')).toBe('29–31 Jan 2027');
    expect(formatRange('2027-02-28', '2027-03-05')).toBe('28 Feb – 5 Mar 2027');
    expect(formatRange('2027-06', '2027-08')).toBe('Jun–Aug 2027');
    expect(formatPartial('2027')).toBe('2027');
  });
  it('says "Not found yet" for absent data', () => {
    expect(costText(events[1]!)).toBe('Not found yet');
    expect(costText(events[2]!)).toBe('300 EUR – 500 EUR');
    expect(whereText(events[1]!)).toBe('Online');
    expect(deadlineText(events[0]!, today)).toBe('18 Nov 2026 (in 12 days)');
    expect(deadlineText(events[1]!, today)).toBe('Not found yet');
  });
});

describe('ics', () => {
  it('exports day-precise events only, with exclusive end date', () => {
    expect(canExportIcs(events[1]!)).toBe(false);
    const ics = eventIcs(
      events[0]!,
      'https://x/#/list?e=iquhack',
      new Date('2026-11-06T10:00:00Z'),
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20270129');
    expect(ics).toContain('DTEND;VALUE=DATE:20270201');
    expect(ics).toContain('SUMMARY:MIT iQuHACK 2027');
  });
});
