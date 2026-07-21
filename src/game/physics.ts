// Pure collision helpers. No game knowledge, no side effects.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pushed-out position plus the contact normal (pointing away from the rect). */
export interface Resolution {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function circleRectOverlap(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
): boolean {
  const px = clamp(cx, rect.x, rect.x + rect.w);
  const py = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

/**
 * If the circle penetrates the rect, return the minimal push-out position and
 * contact normal; otherwise null. Handles the center-inside-rect case by
 * pushing out along the axis of least penetration.
 */
export function resolveCircleRect(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
): Resolution | null {
  const px = clamp(cx, rect.x, rect.x + rect.w);
  const py = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - px;
  const dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;

  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    return { x: px + nx * r, y: py + ny * r, nx, ny };
  }

  // Center is inside the rect: push out through the nearest face.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy, nx: -1, ny: 0 };
  if (m === right) return { x: rect.x + rect.w + r, y: cy, nx: 1, ny: 0 };
  if (m === top) return { x: cx, y: rect.y - r, nx: 0, ny: -1 };
  return { x: cx, y: rect.y + rect.h + r, nx: 0, ny: 1 };
}
