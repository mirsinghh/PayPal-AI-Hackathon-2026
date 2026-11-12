export interface Pt {
  x: number;
  y: number;
}

export interface Arc {
  a: Pt;
  c: Pt;
  b: Pt;
}

/**
 * A quadratic arc from a to b that bows sideways by `bow` (a fraction of the chord length). All four edges of the
 * negotiation map bow the same way round, which gives the map its pinwheel feel and keeps arcs from crossing.
 */
export function arc(a: Pt, b: Pt, bow = 0.16): Arc {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return { a, b, c: { x: mx + (-dy / len) * len * bow, y: my + (dx / len) * len * bow } };
}

/** Point on the arc at t in [0,1] (t=0 at a, t=1 at b). Markers travel along exactly the line that is drawn. */
export function arcPoint({ a, c, b }: Arc, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export const arcPath = ({ a, c, b }: Arc): string => `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;

/** Maps a price onto a track of `width` px between lo and hi, clamped so markers never leave the track. */
export function priceX(cents: number, lo: number, hi: number, width: number, pad = 6): number {
  const t = (cents - lo) / (hi - lo);
  return Math.min(width - pad, Math.max(pad, t * width));
}
