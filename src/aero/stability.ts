/**
 * Longitudinal stability: where the neutral point sits, and how far the centre
 * of gravity is ahead of it.
 *
 * The neutral point is the CG position at which the aircraft is indifferent to
 * a disturbance in pitch. Ahead of it, a nose-up gust makes a nose-down moment
 * and the aircraft returns; behind it, the disturbance grows. Everything about
 * pitch stability is that one distance, measured in mean chords:
 *
 *   x_np / MAC = x_ac / MAC + eta_t (a_t / a_w) V_H (1 - de/dalpha)
 *
 * The tail is treated as what it is - another lifting surface - so its
 * lift-curve slope comes from the same lifting-line solve as the wing's rather
 * than from a separate approximation.
 *
 * KNOWN GAP: there is no fuselage yet. A real fuselage is destabilising and
 * moves the neutral point forward, typically by 5 to 15% of MAC, so the margins
 * reported here are optimistic. `fuselageAllowance` exists to make that visible
 * rather than silent.
 */

import { atAlpha, factorWing } from './llt'
import { planform } from './planform'
import type { BalanceParams, TailParams, WingParams } from './params'

/** Aerodynamic centre of a subsonic wing, as a fraction of MAC. */
export const WING_AERODYNAMIC_CENTRE = 0.25

/**
 * Dynamic pressure at the tail as a fraction of freestream. The tail sits in
 * the wing's wake and behind a fuselage, so it never sees the full flow.
 */
export const TAIL_EFFICIENCY = 0.9

/** Static margin band that makes for an aircraft people like flying. */
export const COMFORTABLE_MARGIN = { min: 0.05, max: 0.2 } as const

export type StabilityVerdict = 'unstable' | 'marginal' | 'stable' | 'very-stable'

export interface Stability {
  /** Neutral point, as a fraction of MAC aft of the MAC leading edge */
  neutralPoint: number
  /** How far the CG sits ahead of the neutral point, in fractions of MAC */
  staticMargin: number
  /** Horizontal tail volume coefficient, V_H */
  tailVolume: number
  /** Tail reference area (m^2) */
  tailArea: number
  tailAspectRatio: number
  /** Tail lift-curve slope, per radian */
  tailLiftSlope: number
  /** Wing lift-curve slope the comparison was made against, per radian */
  wingLiftSlope: number
  /** de/dalpha - how much of a change in wing incidence the tail never sees */
  downwashGradient: number
  /** The furthest aft the CG can go and still be stable at all */
  aftLimit: number
  /** How much of the margin a typical fuselage would be expected to eat */
  fuselageAllowance: number
  verdict: StabilityVerdict
}

/**
 * The tailplane expressed as a wing, so it can go through the same planform and
 * lifting-line code. A tailplane is unswept, untwisted and flat here; its
 * rigging angle is a trim quantity, not a shape one.
 */
export function tailAsWing(tail: TailParams): WingParams {
  return {
    span: tail.span,
    rootChord: tail.rootChord,
    taper: tail.taper,
    sweepQuarter: 0,
    twist: 0,
    dihedral: 0,
    naca: tail.naca,
  }
}

/**
 * Downwash gradient at the tail.
 *
 * The far-field value behind an elliptically loaded wing, de/dalpha = 2 a_w /
 * (pi AR). A tail at a real arm sits in slightly less downwash than that, so
 * this overestimates it - which understates the tail's contribution and reports
 * a slightly conservative neutral point. Erring toward less stability is the
 * right direction to err in.
 */
export function downwashGradient(wingLiftSlope: number, aspectRatio: number): number {
  if (aspectRatio <= 0) return 0
  return (2 * wingLiftSlope) / (Math.PI * aspectRatio)
}

function verdictFor(staticMargin: number): StabilityVerdict {
  if (staticMargin < 0) return 'unstable'
  if (staticMargin < COMFORTABLE_MARGIN.min) return 'marginal'
  if (staticMargin <= COMFORTABLE_MARGIN.max) return 'stable'
  return 'very-stable'
}

/**
 * The tail's factorisation depends only on the tail's own shape, but stability
 * is recomputed whenever any parameter moves - including airspeed and incidence,
 * which cannot change it. Keying a single-entry cache on the parameter object's
 * identity is enough: the store only builds a new tail object when the tail
 * actually changes, so dragging any other slider reuses this.
 */
let cachedTail: TailParams | null = null
let cachedTailSolution: ReturnType<typeof factorWing> | null = null

function tailSolution(tail: TailParams) {
  if (cachedTail !== tail || cachedTailSolution === null) {
    cachedTail = tail
    cachedTailSolution = factorWing(tailAsWing(tail))
  }
  return cachedTailSolution
}

export function stability(
  wing: WingParams,
  tail: TailParams,
  balance: BalanceParams,
  wingLiftSlope: number,
): Stability {
  const wingGeometry = planform(wing)
  const tailGeometry = planform(tailAsWing(tail))

  // The tail gets a full lifting-line solve of its own - a low-aspect-ratio
  // tailplane has a noticeably shallower lift curve than the wing, and that
  // ratio goes straight into the neutral point.
  const tailLiftSlope = atAlpha(tailSolution(tail), 0).clAlpha

  const tailVolume =
    (tailGeometry.area * tail.arm) / (wingGeometry.area * wingGeometry.mac)

  const epsilon = downwashGradient(wingLiftSlope, wingGeometry.aspectRatio)

  const tailContribution =
    wingLiftSlope > 0
      ? TAIL_EFFICIENCY * (tailLiftSlope / wingLiftSlope) * tailVolume * (1 - epsilon)
      : 0

  const neutralPoint = WING_AERODYNAMIC_CENTRE + tailContribution
  const staticMargin = neutralPoint - balance.cg

  return {
    neutralPoint,
    staticMargin,
    tailVolume,
    tailArea: tailGeometry.area,
    tailAspectRatio: tailGeometry.aspectRatio,
    tailLiftSlope,
    wingLiftSlope,
    downwashGradient: epsilon,
    aftLimit: neutralPoint,
    // A destabilising fuselage typically pulls the neutral point forward by
    // about a tenth of a chord. Reported, not applied - the model does not have
    // a fuselage to measure, and inventing one would be worse than saying so.
    fuselageAllowance: 0.1,
    verdict: verdictFor(staticMargin),
  }
}
