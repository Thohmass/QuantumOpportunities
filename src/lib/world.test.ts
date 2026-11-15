import { zoomIdentity } from 'd3-zoom';
import { geoMercator } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { constrainWithRoom, loadLand, worldExtent } from './world';

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

describe('constrainWithRoom', () => {
  const view: [[number, number], [number, number]] = [
    [0, 0],
    [400, 800],
  ];
  const world: [[number, number], [number, number]] = [
    [0, 0],
    [1000, 600],
  ];
  it('lets any place of the world, even its corner, reach the middle of the view', () => {
    // Put the world's top-left corner in the middle of the view, at zoom 4.
    const t = zoomIdentity.translate(200, 400).scale(4);
    const c = constrainWithRoom(t, view, world);
    expect(c.x).toBeCloseTo(200);
    expect(c.y).toBeCloseTo(400);
  });
  it('stops a little further than that', () => {
    const t = zoomIdentity.translate(500, 900).scale(4);
    const c = constrainWithRoom(t, view, world);
    expect(c.x).toBeCloseTo(200);
    expect(c.y).toBeCloseTo(400);
  });
  it('allows the same room on screen at every zoom', () => {
    for (const k of [2, 8, 32]) {
      const c = constrainWithRoom(zoomIdentity.translate(9999, 0).scale(k), view, world);
      expect(c.x).toBeCloseTo(200); // the world's left edge at most half a screen in
    }
  });
});
