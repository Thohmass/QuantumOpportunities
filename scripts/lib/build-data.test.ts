import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeData } from './build-data.ts';

describe('writeData', () => {
  it('builds the frozen test data with the schema of this repository', () => {
    const out = mkdtempSync(join(tmpdir(), 'qo-out-'));
    const n = writeData('e2e/fixtures', out, new Date('2026-11-18T12:00:00Z'));
    const events = JSON.parse(readFileSync(join(out, 'events.json'), 'utf8'));
    const meta = JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8'));
    expect(events).toHaveLength(n);
    expect(n).toBeGreaterThan(0);
    expect(meta.generatedAt).toBe('2026-11-18T12:00:00.000Z');
    rmSync(out, { recursive: true });
  });

  it('refuses invalid data instead of writing it', () => {
    const root = mkdtempSync(join(tmpdir(), 'qo-bad-'));
    cpSync('e2e/fixtures/data/taxonomy', join(root, 'data/taxonomy'), { recursive: true });
    mkdirSync(join(root, 'data/events/2027'), { recursive: true });
    writeFileSync(join(root, 'data/events/2027/broken.yaml'), 'id: broken\nname: 42\n');
    expect(() => writeData(root, join(root, 'out'))).toThrow(/error/);
    rmSync(root, { recursive: true });
  });
});
