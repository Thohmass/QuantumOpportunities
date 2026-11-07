import { describe, expect, it } from 'vitest';
import { hexPack, type Pt } from './pack';

const D = 16;
const at = (pts: Pt[], off: [number, number][]) =>
  pts.map((p, i) => ({ x: p.x + off[i]![0], y: p.y + off[i]![1] }));
function minGap(pts: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      m = Math.min(m, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
  return m;
}

describe('hexPack', () => {
  it('leaves dots with room around them where they are', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 40 },
    ];
    expect(hexPack(pts, D)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('separates dots in exactly the same place, close to that place', () => {
    const pts = Array.from({ length: 7 }, () => ({ x: 50, y: 50 }));
    const placed = at(pts, hexPack(pts, D));
    expect(minGap(placed)).toBeGreaterThanOrEqual(D - 1e-6);
    for (const p of placed) expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThanOrEqual(D * 1.6);
  });

  it('puts overlapping dots on one hexagonal lattice', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 2 },
      { x: 9, y: -3 },
      { x: 2, y: 8 },
    ];
    const placed = at(pts, hexPack(pts, D));
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const dist = Math.hypot(placed[i]!.x - placed[j]!.x, placed[i]!.y - placed[j]!.y);
        // Lattice distances are D, D·√3, 2D, ...: never less than D.
        expect(dist).toBeGreaterThanOrEqual(D - 1e-6);
      }
  });

  it('keeps everything apart in a dense crowd, and moves dots only a little', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 60;
    const pts = Array.from({ length: 30 }, () => ({ x: rnd(), y: rnd() }));
    const off = hexPack(pts, D);
    expect(minGap(at(pts, off))).toBeGreaterThanOrEqual(D * 0.999 - 1e-6);
    const mean = off.reduce((s, [dx, dy]) => s + Math.hypot(dx, dy), 0) / off.length;
    expect(mean).toBeLessThan(D * 2);
  });

  it('is deterministic', () => {
    const pts = [
      { x: 1, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 5 },
    ];
    expect(hexPack(pts, D)).toEqual(hexPack(pts, D));
  });
});
