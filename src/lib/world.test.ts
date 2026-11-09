import { geoMercator } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { loadLand, worldExtent } from './world';

describe('worldExtent', () => {
  const land = loadLand();
  it('stops at the date line, not at the edges of a box that is wider than the world', () => {
    const p = geoMercator().fitSize([2000, 400], land);
    const [[x0, y0], [x1, y1]] = worldExtent(p, land);
    expect(x0).toBeGreaterThan(0);
    expect(x1).toBeLessThan(2000);
    expect(x0).toBeCloseTo(p([-180, 0])![0], 6);
    expect(x1).toBeCloseTo(p([180, 0])![0], 6);
    expect(y0).toBeCloseTo(0, 0);
    expect(y1).toBeCloseTo(400, 0);
  });
  it('stops at the land when the box is taller than the world', () => {
    const p = geoMercator().fitSize([400, 2000], land);
    const [[, y0], [, y1]] = worldExtent(p, land);
    expect(y0).toBeGreaterThan(0);
    expect(y1).toBeLessThan(2000);
  });
});
