// Keeps map dots from overlapping. Dots closer than `d` pixels are grouped; each group snaps onto a hexagonal
// lattice (spacing `d`) centred on the group, and the lattice's offset and the dot-to-slot assignment are chosen so
// that every dot moves as little as possible from its true position. Dots with room around them don't move.
// Groups that end up touching each other are merged and placed again, until nothing overlaps.

export interface Pt {
  x: number;
  y: number;
}

const SQRT3_2 = Math.sqrt(3) / 2;
const NINE = [0, 1 / 3, 2 / 3].flatMap((u) => [0, 1 / 3, 2 / 3].map((v) => [u, v] as const));
const THREE = [
  [0, 0],
  [1 / 2, 0],
  [0, 1 / 2],
] as const;
const ONE = [[0, 0]] as const;
// Lattice cell (i, j) as one number, for fast sets.
const cellKey = (i: number, j: number) => (i + 50_000) * 100_000 + (j + 50_000);

/** Returns, for every input point, the offset [dx, dy] (in the same units) to draw it at. */
export function hexPack(pts: readonly Pt[], d: number): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = pts.map(() => [0, 0]);
  if (n < 2 || d <= 0) return out;

  const parent = pts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const join = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  };

  // Start: group points whose true positions are closer than d.
  for (const [i, j] of closePairs(pts, d)) join(i, j);

  let placed = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let round = 0; round < 24; round++) {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const g = groups.get(r);
      if (g) g.push(i);
      else groups.set(r, [i]);
    }
    placed = pts.map((p) => ({ x: p.x, y: p.y }));
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const slots = placeGroup(
        g.map((i) => pts[i]!),
        d,
      );
      g.forEach((i, k) => (placed[i] = slots[k]!));
    }
    // Placed groups may now touch a neighbour: merge them and place again.
    let merged = false;
    for (const [i, j] of closePairs(placed, d * 0.999)) if (join(i, j)) merged = true;
    if (!merged) break;
  }
  for (let i = 0; i < n; i++) out[i] = [placed[i]!.x - pts[i]!.x, placed[i]!.y - pts[i]!.y];
  return out;
}

/** Pairs of points closer than r (grid hashing, so it stays fast for many points). */
function closePairs(pts: readonly Pt[], r: number): [number, number][] {
  const cell = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  pts.forEach((p, i) => {
    const k = key(Math.floor(p.x / r), Math.floor(p.y / r));
    const c = cell.get(k);
    if (c) c.push(i);
    else cell.set(k, [i]);
  });
  const out: [number, number][] = [];
  const r2 = r * r;
  pts.forEach((p, i) => {
    const cx = Math.floor(p.x / r);
    const cy = Math.floor(p.y / r);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++)
        for (const j of cell.get(key(cx + ox, cy + oy)) ?? []) {
          if (j <= i) continue;
          const dx = pts[j]!.x - p.x;
          const dy = pts[j]!.y - p.y;
          if (dx * dx + dy * dy < r2) out.push([i, j]);
        }
  });
  return out;
}

/** Places one group on a hexagonal lattice around its centre with the least total squared movement. */
function placeGroup(group: readonly Pt[], d: number): Pt[] {
  const m = group.length;
  const cx = group.reduce((s, p) => s + p.x, 0) / m;
  const cy = group.reduce((s, p) => s + p.y, 0) / m;
  let best: { cost: number; slots: Pt[] } | undefined;
  // Try a few positions of the lattice inside one cell (u, v along the two lattice axes); big groups gain little
  // from this, so they try fewer.
  const offsets = m <= 12 ? NINE : m <= 40 ? THREE : ONE;
  for (const [u, v] of offsets) {
    const r = assign(group, d, cx + u * d + v * (d / 2), cy + v * d * SQRT3_2);
    if (!best || r.cost < best.cost - 1e-9) best = r;
  }
  return best!.slots;
}

/**
 * Greedy assignment of points to lattice slots near them (closest pairs first), widening the search for any point
 * whose nearby slots are all taken; then a few passes of swaps between neighbours.
 */
function assign(
  group: readonly Pt[],
  d: number,
  ox: number,
  oy: number,
): { cost: number; slots: Pt[] } {
  const h = d * SQRT3_2;
  const slotAt = (i: number, j: number): Pt => ({ x: ox + i * d + j * (d / 2), y: oy + j * h });
  const c = (p: Pt, s: Pt) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
  const cellOf = (p: Pt): [number, number] => {
    const j = Math.round((p.y - oy) / h);
    return [Math.round((p.x - ox - j * (d / 2)) / d), j];
  };
  const of: (Pt | undefined)[] = new Array(group.length).fill(undefined);
  const used = new Set<number>();
  let todo = group.map((_, i) => i);
  for (let reach = 2; todo.length; reach *= 2) {
    const pairs: [number, number, number, number][] = [];
    for (const i of todo) {
      const [ci, cj] = cellOf(group[i]!);
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const si = ci + di - Math.trunc(dj / 2);
          const sj = cj + dj;
          if (used.has(cellKey(si, sj))) continue;
          pairs.push([c(group[i]!, slotAt(si, sj)), i, si, sj]);
        }
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    for (const [, i, si, sj] of pairs) {
      const k = cellKey(si, sj);
      if (of[i] || used.has(k)) continue;
      of[i] = slotAt(si, sj);
      used.add(k);
    }
    todo = todo.filter((i) => !of[i]);
  }
  const slots = of as Pt[];
  const near = closePairs(slots, d * 2.1);
  for (let pass = 0; pass < 4; pass++) {
    let better = false;
    for (const [i, j] of near) {
      const now = c(group[i]!, slots[i]!) + c(group[j]!, slots[j]!);
      const swapped = c(group[i]!, slots[j]!) + c(group[j]!, slots[i]!);
      if (swapped < now - 1e-9) {
        [slots[i], slots[j]] = [slots[j]!, slots[i]!];
        better = true;
      }
    }
    if (!better) break;
  }
  const cost = group.reduce((s, p, i) => s + c(p, slots[i]!), 0);
  return { cost, slots };
}
