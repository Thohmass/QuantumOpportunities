import { describe, expect, it } from 'vitest';
import { CURVES, SIZE_DEFAULTS, radiusAt } from './size';

describe('bubble size by zoom', () => {
  const s = { ...SIZE_DEFAULTS, fromRadius: 4, toRadius: 12, fromZoom: 1, toZoom: 16 };

  it('starts small, ends large, and stays put outside the range', () => {
    expect(radiusAt(s, 1)).toBeCloseTo(4);
    expect(radiusAt(s, 0.5)).toBeCloseTo(4);
    expect(radiusAt(s, 16)).toBeCloseTo(12);
    expect(radiusAt(s, 60)).toBeCloseTo(12);
  });
  it('grows continuously as the zoom increases', () => {
    let prev = 0;
    for (let k = 1; k <= 16; k *= 1.1) {
      const r = radiusAt(s, k);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
  it('counts zoom in steps: halfway (zoom 4 of 1–16) is the middle of a linear growth', () => {
    expect(radiusAt({ ...s, curve: 'linear' }, 4)).toBeCloseTo(8);
  });
  it('has curves that start at 0 and end at 1, each with its own shape', () => {
    for (const f of Object.values(CURVES)) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
    }
    expect(CURVES['ease-in'](0.5)).toBeLessThan(0.5);
    expect(CURVES['ease-out'](0.5)).toBeGreaterThan(0.5);
    expect(CURVES.smooth(0.5)).toBeCloseTo(0.5);
    expect(CURVES.smooth(0.1)).toBeLessThan(0.1);
  });
});
