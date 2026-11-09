// A magnifying lens for the map (experiment): bubbles near the focus (the mouse on desktop, the middle of the map on
// phones) grow, and their neighbours are pushed aside to make room, like the Apple Watch app grid.
//
// A smooth fisheye: a point at distance d from the focus moves to d·(1 + c·e^(−(d/σ)²)). Near the focus that
// magnifies 1 + c times; further out the push fades smoothly (no hard rim where things would jump), and in a ring
// around the focus space is squeezed a little to make up for it. Bubbles grow with a matching bump (largest at
// the focus) and shrink where space is squeezed, so grown neighbours don't pile onto each other: the same ring of
// smaller bubbles that the Watch has. (Classic reference: Sarkar & Brown, Graphical Fisheye Views, 1993; their
// formula has a hard rim, which this smooth variant avoids.)

export interface LensSettings {
  on: boolean;
  /** Small dots (zoomed out): reach of the lens (px) and the size at its centre (× the dot). */
  dotRadius: number;
  dotScale: number;
  /** Icon bubbles (zoomed in): reach and size at the centre (× the bubble). */
  iconRadius: number;
  iconScale: number;
  /** How much room opens for the grown bubbles (0 = they only grow, 1 = neighbours move as much as they grow). */
  push: number;
  /** How quickly the lens follows the focus (ms; 0 = at once). */
  follow: number;
  /** Where the lens is: under the mouse, or always in the middle of the map (as on phones). */
  focus: 'pointer' | 'centre';
  /** Magnify the land as well (nothing is ever off its true place, but the coastline bends). */
  land: boolean;
}

export const LENS_DEFAULTS: LensSettings = {
  on: true,
  dotRadius: 90,
  dotScale: 2.2,
  iconRadius: 200,
  iconScale: 1.5,
  push: 0.85,
  follow: 70,
  focus: 'pointer',
  land: false,
};

export interface Lens {
  /** Focus point (px in the map box). */
  fx: number;
  fy: number;
  /** Width of the lens (px): σ of the bump; the effect is mostly gone at `reach` = σ / 0.55. */
  sigma: number;
  /** Bubble size at the centre (×). */
  scale: number;
  /** Positions: magnification at the centre is 1 + c. */
  c: number;
  /** 0..1: fades the whole effect in and out. */
  strength: number;
}

/** Above this push the squeezed ring would fold over (points overtaking each other). */
const C_MAX = 2.2;

export function makeLens(
  s: LensSettings,
  fx: number,
  fy: number,
  strength: number,
  icons: boolean,
): Lens {
  const reach = icons ? s.iconRadius : s.dotRadius;
  const scale = 1 + ((icons ? s.iconScale : s.dotScale) - 1) * strength;
  return {
    fx,
    fy,
    sigma: reach * 0.55,
    scale,
    c: Math.min(C_MAX, s.push * (scale - 1)),
    strength,
  };
}

/** Where a point (px) appears under the lens. */
export function lensPoint(l: Lens, x: number, y: number): [number, number] {
  const dx = x - l.fx;
  const dy = y - l.fy;
  const u = (dx * dx + dy * dy) / (l.sigma * l.sigma);
  if (l.c <= 0 || u > 12) return [x, y];
  const f = 1 + l.c * Math.exp(-u);
  return [l.fx + dx * f, l.fy + dy * f];
}

/** How much a bubble at this point (px, before the lens) grows: `scale` at the focus, 1 far away, and a little
 * less than 1 where the lens squeezes space (so neighbours there don't overlap). */
export function lensScale(l: Lens, x: number, y: number): number {
  const u = ((x - l.fx) ** 2 + (y - l.fy) ** 2) / (l.sigma * l.sigma);
  if (u > 12) return 1;
  const e = Math.exp(-u);
  const bump = 1 + (l.scale - 1) * e;
  const radial = 1 + l.c * e * (1 - 2 * u); // how much space is stretched (>1) or squeezed (<1) outwards
  return bump * Math.min(1, radial);
}
