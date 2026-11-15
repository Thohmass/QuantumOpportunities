// How big the map's bubbles are at each zoom level: they grow continuously as you zoom in, from a small dot over
// the whole world to a bubble with its type icon at city level. Tunable in the map lab panel (?lab).

export type Curve = 'linear' | 'ease-in' | 'ease-out' | 'smooth';

export interface SizeSettings {
  /** Bubble radius (px) when zoomed all the way out, and at (or past) `toZoom`. */
  fromRadius: number;
  toRadius: number;
  /** The zoom levels between which the bubbles grow (1 = the whole world). */
  fromZoom: number;
  toZoom: number;
  /** The shape of the growth between them. Zoom is counted in steps (each step doubles it), as you feel it. */
  curve: Curve;
  /** From this radius on a bubble shows its type icon. */
  iconAt: number;
  /** Free space between neighbouring bubbles (px). */
  gap: number;
}

export const SIZE_DEFAULTS: SizeSettings = {
  fromRadius: 4.5,
  toRadius: 13,
  fromZoom: 1,
  toZoom: 12,
  curve: 'smooth',
  iconAt: 8.5,
  gap: 4,
};

export const CURVES: Record<Curve, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t, // slow at first, faster when zoomed in
  'ease-out': (t) => 1 - (1 - t) * (1 - t), // fast at first, settling when zoomed in
  smooth: (t) => t * t * (3 - 2 * t), // slow at both ends
};

/** Bubble radius (px) at zoom k. */
export function radiusAt(s: SizeSettings, k: number): number {
  const a = Math.log2(Math.max(1e-6, s.fromZoom));
  const b = Math.log2(Math.max(s.fromZoom * 1.0001, s.toZoom));
  const t = Math.min(1, Math.max(0, (Math.log2(k) - a) / (b - a)));
  return s.fromRadius + (s.toRadius - s.fromRadius) * CURVES[s.curve](t);
}
