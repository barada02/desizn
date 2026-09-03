/**
 * Shared chart box and scales.
 *
 * Both charts sit in the same strip, so they share one drawing box - matching
 * plot edges and matching type sizes are most of what makes two charts read as
 * one instrument rather than two widgets.
 */

export const VB_W = 460
export const VB_H = 196

const PAD_L = 38
const PAD_R = 12
const PAD_T = 12
const PAD_B = 30

export const PLOT_L = PAD_L
export const PLOT_R = VB_W - PAD_R
export const PLOT_T = PAD_T
export const PLOT_B = VB_H - PAD_B
export const PLOT_W = PLOT_R - PLOT_L
export const PLOT_H = PLOT_B - PLOT_T

export type Scale = (value: number) => number

/** A linear scale from a data domain onto a pixel range. */
export function linear(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): Scale {
  const span = domainMax - domainMin
  if (span === 0) return () => rangeMin
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin)
}

/** Turn a run of points into an SVG path, skipping anything non-finite. */
export function polyline(
  points: { x: number; y: number }[],
): string {
  return points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')
}

/** Convert a pointer event to a value on the x scale's domain. */
export function pointerDomainX(
  event: { clientX: number; currentTarget: { getBoundingClientRect: () => DOMRect } },
  domainMin: number,
  domainMax: number,
): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * VB_W
  return domainMin + ((x - PLOT_L) / PLOT_W) * (domainMax - domainMin)
}
