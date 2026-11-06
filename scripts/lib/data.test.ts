import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDay } from '../../src/lib/dates.ts';
import type { RawEvent } from '../../src/lib/types.ts';
import { missingFields, toOutput } from './derive.ts';
import { geocode } from './geocode.ts';
import { loadDataset } from './load.ts';
import { buildQueue, tierFor } from './queue.ts';
import { findSimilar, nameSimilarity, normaliseUrl } from './similarity.ts';
import { planStubs } from './stubs.ts';
import { validateDataset } from './validate.ts';
import { eventYaml } from './write.ts';

const base = (over: Partial<RawEvent> = {}): RawEvent => ({
  id: 'qhack-2027',
  series: 'qhack',
  name: 'QHack 2027',
  type: 'hackathon',
  status: 'confirmed',
  format: 'online',
  dates: { start: '2027-10-15', end: '2027-10-22' },
  url: 'https://qhack.ai/',
  sources: [{ url: 'https://qhack.ai/', kind: 'official', accessed: '2026-11-01' }],
  checks: { last_checked: '2026-11-01', unchanged_streak: 0 },
  added: { date: '2026-11-01', by: 'test' },
  ...over,
});

describe('similarity', () => {
  it('normalises URLs', () => {
    expect(normaliseUrl('https://www.QHack.ai/index.html?x=1#y')).toBe('qhack.ai');
    expect(normaliseUrl('https://example.org/events/2027/')).toBe('example.org/events/2027');
  });
  it('ignores years in names', () => {
    expect(nameSimilarity('QHack 2026', 'QHack 2027')).toBe(1);
    expect(nameSimilarity('MIT iQuHACK', 'Yale YQuantum')).toBeLessThan(0.4);
  });
  it('flags the same edition and not the next one', () => {
    const index = [
      {
        id: 'qhack-2027',
        series: 'qhack',
        name: 'QHack 2027',
        start: '2027-10-15',
        end: '2027-10-22',
        status: 'confirmed',
        urls: ['qhack.ai'],
      },
    ];
    expect(
      findSimilar({ name: 'Xanadu QHack', start: '2027-10' }, index)[0]!.score,
    ).toBeGreaterThanOrEqual(0.85);
    expect(
      findSimilar({ name: 'QHack', start: '2028-10', url: 'https://qhack.ai' }, index)[0]!.reasons,
    ).toContain('same official URL');
    const next = findSimilar({ name: 'QHack 2028', start: '2028-10-14' }, index)[0];
    expect(next?.score ?? 0).toBeLessThan(0.85);
  });
});

describe('geocode', () => {
  it('finds cities with diacritics, exonyms and split names', () => {
    expect(geocode('Copenhagen', 'DK')).toBeDefined();
    expect(geocode('Zurich', 'CH')).toBeDefined();
    expect(geocode('Gothenburg', 'SE')).toBeDefined();
    expect(geocode('San Sebastián', 'ES')).toBeDefined();
    expect(geocode('Atlantis', 'GR')).toBeUndefined();
  });
});

describe('completeness', () => {
  it('lists missing critical fields', () => {
    expect(missingFields(base())).toEqual(['deadline', 'cost', 'team size']);
    expect(
      missingFields(base({ dates: { start: '2027-10' }, format: 'in_person', url: undefined })),
    ).toEqual(['exact dates', 'location', 'official page', 'deadline', 'cost', 'team size']);
    expect(missingFields(base({ deadlines: 'n/a', cost: { kind: 'free' }, team: 'n/a' }))).toEqual(
      [],
    );
  });
  it('derives coordinates and continent', () => {
    const out = toOutput(
      base({ format: 'in_person', location: { city: 'Lausanne', country: 'CH' } }),
    );
    expect(out.continent).toBe('EU');
    expect(out.lat).toBeCloseTo(46.52, 1);
  });
});

describe('queue', () => {
  const today = parseDay('2026-11-06');
  it('tiers by distance', () => {
    expect(tierFor(10)).toBe('A');
    expect(tierFor(60)).toBe('B');
    expect(tierFor(400)).toBe('D');
  });
  it('skips fresh and past events, orders by urgency × gaps', () => {
    const soon = base({
      id: 'soon',
      dates: { start: '2026-11-20' },
      checks: { last_checked: '2026-11-01', unchanged_streak: 0 },
    });
    const far = base({
      id: 'far',
      dates: { start: '2027-10-15' },
      checks: { last_checked: '2026-09-01', unchanged_streak: 0 },
    });
    const fresh = base({
      id: 'fresh',
      dates: { start: '2027-10-15' },
      checks: { last_checked: '2026-11-05', unchanged_streak: 0 },
    });
    const past = base({ id: 'past', dates: { start: '2026-10-01' } });
    const q = buildQueue(
      [soon, far, fresh, past].map((doc) => ({ file: `${doc.id}.yaml`, doc })),
      today,
    );
    expect(q.map((x) => x.id)).toEqual(['soon', 'far']);
  });
  it('backs off after unchanged checks but obeys flags', () => {
    const e = base({
      id: 'e',
      dates: { start: '2027-10-15' },
      checks: { last_checked: '2026-10-01', unchanged_streak: 3 },
    });
    expect(buildQueue([{ file: 'e', doc: e }], today)).toEqual([]);
    expect(buildQueue([{ file: 'e', doc: e }], today, new Set(['e']))).toHaveLength(1);
  });
});

describe('stubs', () => {
  it('predicts the next edition of an annual series once the last one started', () => {
    const series = [{ id: 'qhack', name: 'QHack', cadence: 'annual' as const }];
    const last = base({
      id: 'qhack-2026',
      name: 'QHack 2026',
      dates: { start: '2026-10-16', end: '2026-10-23' },
    });
    const stubs = planStubs(series, [last], parseDay('2026-11-06'), new Set(['qhack-2026']));
    expect(stubs).toHaveLength(1);
    expect(stubs[0]!.event).toMatchObject({
      id: 'qhack-2027',
      name: 'QHack 2027',
      status: 'expected',
      dates: { start: '2027-10' },
    });
    expect(stubs[0]!.event.expected!.confidence).toBe('medium');
    // not before the latest edition starts
    expect(planStubs(series, [last], parseDay('2026-10-01'), new Set())).toEqual([]);
  });
});

describe('validation', () => {
  function fixture(events: Record<string, string>, extra: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'qo-'));
    cpSync('schema', join(dir, 'schema'), { recursive: true });
    cpSync('data/taxonomy', join(dir, 'data/taxonomy'), { recursive: true });
    for (const [p, body] of Object.entries({ ...events, ...extra })) {
      mkdirSync(join(dir, p, '..'), { recursive: true });
      writeFileSync(join(dir, p), body);
    }
    return dir;
  }
  const org = 'id: xanadu\nname: Xanadu\ntype: company\n';
  const series = 'id: qhack\nname: QHack\ncadence: annual\n';

  it('accepts a valid event', () => {
    const dir = fixture(
      { 'data/events/2027/qhack-2027.yaml': eventYaml(base({ organizers: ['xanadu'] })) },
      { 'data/orgs/xanadu.yaml': org, 'data/series/qhack.yaml': series },
    );
    const r = validateDataset(loadDataset(dir));
    rmSync(dir, { recursive: true });
    expect(r.errors).toEqual([]);
  });

  it('rejects bad files with useful messages', () => {
    const dir = fixture(
      {
        'data/events/2027/qhack-2027.yaml': eventYaml(
          base({ organizers: ['nobody'], status: 'expected' }),
        ),
        'data/events/2026/wrong-year.yaml': eventYaml(
          base({
            id: 'wrong-year',
            series: undefined,
            name: 'Other thing',
            dates: { start: '2027-01-01', end: '2026-12-01' },
            url: 'https://other.org',
          }),
        ),
        'data/events/2027/bad.yaml': 'id: bad\nname: x\n',
      },
      { 'data/series/qhack.yaml': series },
    );
    const r = validateDataset(loadDataset(dir));
    rmSync(dir, { recursive: true });
    const all = r.errors.join('\n');
    expect(all).toContain('unknown organisation "nobody"');
    expect(all).toContain('needs expected.basis');
    expect(all).toContain('must live in data/events/2027/');
    expect(all).toContain('dates.end is before dates.start');
    expect(all).toContain('bad.yaml');
  });

  it('catches a planted duplicate unless whitelisted', () => {
    const a = eventYaml(base({ series: undefined }));
    const b = eventYaml(
      base({
        id: 'xanadu-qhack-2027',
        series: undefined,
        name: 'Xanadu QHack 2027',
        url: 'https://qhack.ai/2027',
      }),
    );
    const files = {
      'data/events/2027/qhack-2027.yaml': a,
      'data/events/2027/xanadu-qhack-2027.yaml': b,
    };
    const dir = fixture(files);
    expect(validateDataset(loadDataset(dir)).errors.join('\n')).toContain('likely duplicate');
    writeFileSync(join(dir, 'data/not-duplicates.yaml'), '- [qhack-2027, xanadu-qhack-2027]\n');
    expect(validateDataset(loadDataset(dir)).errors).toEqual([]);
    rmSync(dir, { recursive: true });
  });
});
