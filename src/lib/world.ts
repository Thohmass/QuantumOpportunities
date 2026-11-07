// The world outline for our own map: Natural Earth 1:110m countries (world-atlas, public domain), turned into
// one land shape, one coastline, one mesh of borders and one hover shape per country. Loaded with the map chunk.
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon } from 'geojson';
import topo from 'world-atlas/countries-110m.json';

const ANTARCTICA = '010';

export interface World {
  countries: Feature<Geometry, { name: string }>[];
  land: MultiPolygon;
  borders: MultiLineString;
}

let cached: World | undefined;

export function loadWorld(): World {
  if (cached) return cached;
  const t = topo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const all = t.objects.countries;
  const geoms = { ...all, geometries: all.geometries.filter((g) => g.id !== ANTARCTICA) };
  const fc = feature(t, geoms) as FeatureCollection<Geometry, { name: string }>;
  cached = {
    countries: fc.features,
    land: merge(t, geoms.geometries as never),
    // Only borders between two countries; coastlines are drawn from the land shape.
    borders: mesh(t, geoms, (a, b) => a !== b),
  };
  return cached;
}
