// The land shape for our own map: Natural Earth 1:110m land (world-atlas, public domain), without Antarctica.
// No country borders: the map shows only land and sea. Loaded with the map chunk.
import { geoPath, type GeoProjection } from 'd3-geo';
import type { ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import topo from 'world-atlas/land-110m.json';

let cached: FeatureCollection<MultiPolygon> | undefined;

/** Land without Antarctica (south of 60°S), as one feature collection. */
export function loadLand(): FeatureCollection<MultiPolygon> {
  if (cached) return cached;
  const t = topo as unknown as Topology<{ land: GeometryCollection }>;
  const fc = feature(t, t.objects.land) as FeatureCollection<MultiPolygon | Polygon>;
  const polys: Polygon['coordinates'][] = [];
  for (const f of fc.features as Feature<MultiPolygon | Polygon>[]) {
    const list = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of list) if (p[0]!.some(([, lat]) => lat! > -60)) polys.push(p);
  }
  cached = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } },
    ],
  };
  return cached;
}

/** The area the map view may show, in projected (unzoomed) pixels: the world from date line to date line, and
 * the land from north to south. Not the map box: when the world is fitted by its height, the box is wider than
 * the world, and zoomed in its margins would be a long way of empty sea. */
export function worldExtent(
  projection: GeoProjection,
  land: FeatureCollection<MultiPolygon>,
): [[number, number], [number, number]] {
  const [[, y0], [, y1]] = geoPath(projection).bounds(land);
  const [x0] = projection([-180, 0])!;
  const [x1] = projection([180, 0])!;
  return [
    [x0, y0],
    [x1, y1],
  ];
}

type Box = [[number, number], [number, number]];

/** How far past the edge of the world the view may go, as a share of the view: half, so any place, even at the
 * edge of the world, can be brought to the middle of the screen (on a phone, under the thumb). It is a share of
 * the screen, not of the world, so zoomed in it is only a short way of sea. */
export const EDGE_ROOM = 0.5;

/** d3-zoom's constrain, with room past the edges of the world (see EDGE_ROOM). */
export function constrainWithRoom(
  transform: ZoomTransform,
  extent: Box,
  world: Box,
): ZoomTransform {
  const k = transform.k;
  const rx = ((extent[1][0] - extent[0][0]) * EDGE_ROOM) / k;
  const ry = ((extent[1][1] - extent[0][1]) * EDGE_ROOM) / k;
  const dx0 = transform.invertX(extent[0][0]) - (world[0][0] - rx);
  const dx1 = transform.invertX(extent[1][0]) - (world[1][0] + rx);
  const dy0 = transform.invertY(extent[0][1]) - (world[0][1] - ry);
  const dy1 = transform.invertY(extent[1][1]) - (world[1][1] + ry);
  return transform.translate(
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1),
  );
}
