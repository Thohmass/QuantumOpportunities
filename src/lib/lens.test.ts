import { describe, expect, it } from 'vitest';
import { LENS_DEFAULTS, lensPoint, lensScale, makeLens } from './lens';

describe('map lens', () => {
  // Reach 100 px, bubbles 3× at the centre, neighbours move as much as bubbles grow.
  const l = makeLens({ ...LENS_DEFAULTS, dotRadius: 100, dotScale: 3, push: 1 }, 0, 0, 1, false);

  it('leaves everything far away alone', () => {
    expect(lensPoint(l, 300, 0)).toEqual([300, 0]);
    expect(lensScale(l, 0, 300)).toBe(1);
  });
  it('is largest at the focus and fades out smoothly, mostly gone at its reach', () => {
    expect(lensScale(l, 0, 0)).toBeCloseTo(3);
    const at = (d: number) => lensScale(l, d, 0);
    expect(at(20)).toBeLessThan(at(0));
    expect(at(40)).toBeLessThan(at(20));
    expect(Math.abs(lensPoint(l, 100, 0)[0] - 100)).toBeLessThan(10);
    expect(Math.abs(at(150) - 1)).toBeLessThan(0.05);
  });
  it('pushes points outwards, keeping their order and direction', () => {
    const xs = [5, 10, 20, 40, 60, 80, 100, 140].map((d) => lensPoint(l, d, 0)[0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    expect(xs[0]!).toBeGreaterThan(5);
    const [x, y] = lensPoint(l, 30, 40);
    expect(y / x).toBeCloseTo(40 / 30);
  });
  it('opens as much room at the focus as the bubbles grow (push = 1)', () => {
    const gap = lensPoint(l, 1, 0)[0] - lensPoint(l, -1, 0)[0];
    expect(gap).toBeCloseTo(6, 1);
  });
  it('makes bubbles a little smaller where it squeezes space', () => {
    const squeezed = [60, 70, 80, 90].map((d) => lensScale(l, d, 0));
    expect(Math.min(...squeezed)).toBeLessThan(1);
  });
  it('never folds over, even when asked for a lot', () => {
    const big = makeLens(
      { ...LENS_DEFAULTS, dotRadius: 100, dotScale: 4, push: 1 },
      0,
      0,
      1,
      false,
    );
    let prev = -1;
    for (let d = 0; d <= 300; d += 2) {
      const x = lensPoint(big, d, 0)[0];
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });
  it('does nothing at zero strength, and only grows at zero push', () => {
    const off = makeLens(LENS_DEFAULTS, 0, 0, 0, false);
    expect(lensScale(off, 0, 0)).toBe(1);
    expect(lensPoint(off, 10, 0)).toEqual([10, 0]);
    const grow = makeLens({ ...LENS_DEFAULTS, push: 0 }, 0, 0, 1, false);
    expect(lensPoint(grow, 10, 0)).toEqual([10, 0]);
    expect(lensScale(grow, 0, 0)).toBeGreaterThan(1);
  });
});
