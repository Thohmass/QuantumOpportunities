// The land shape for our own map: Natural Earth 1:110m land (world-atlas, public domain), without Antarctica.
// No country borders: the map shows only land and sea. Loaded with the map chunk.
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
