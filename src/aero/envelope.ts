/**
 * Stall and the flight envelope.
 *
 * Lifting-line theory has no stall model, so the wing's maximum lift is found
 * the way preliminary design finds it - the critical section method. Every
 * section's lift coefficient is affine in angle of attack, so for each one we
 * can solve exactly for the angle at which it reaches its own stall. The wing
 * stalls at the lowest of those angles, and the section that gets there first
 * is where the stall starts.
 *
 * That makes washout mean something real here: unloading the tip moves the
 * critical station inboard, which is the whole reason for rigging it.
 */

import { atmosphere } from './atmosphere'
import { atAlpha, type LiftingLineSolution } from './llt'
import type { AircraftParams } from './params'
import { planform } from './planform'

const G = 9.80665

/**
 * Limit load factors for a normal-category aeroplane under FAR-23. These are a
 * certification choice rather than anything the aerodynamics decides, which is
 * why they are constants here and not sliders.
 */
export const LIMIT_LOAD_POSITIVE = 3.8
export const LIMIT_LOAD_NEGATIVE = -1.52

/**
 * Inverted flight reaches a lower peak than upright: the camber that helps one
 * way round hurts the other. A fraction rather than a separate solve, because
 * the sections are not modelled inverted.
 */
const INVERTED_CLMAX_FRACTION = 0.7

/**
 * Design dive speed as a multiple of the manoeuvre speed. Together with the
 * FAR-23 limit load this puts V_D near 3.7 times the stall speed, which is
 * ordinary for a light aeroplane.
 */
const DIVE_SPEED_FACTOR = 1.9

/** Where the negative limit starts easing off toward zero at the dive speed. */
const NEGATIVE_PLATEAU_END = 0.75

export interface WingStall {
  /** Wing lift coefficient at the stall */
  clMax: number
  /** Angle of attack at which the first section lets go (deg) */
  alphaStall: number
  /** Where along the span the stall starts, as 2y/b */
  criticalEta: number
  /** True when the stall begins outboard of 70% semi-span, near the ailerons */
  stallsAtTip: boolean
}

export interface VnPoint {
  /** True airspeed (m/s) */
  v: number
  /** Load factor */
  n: number
}

export interface FlightEnvelope extends WingStall {
  /** Level-flight stall speed, n = 1 (m/s) */
  stallSpeed: number
  /** Manoeuvre speed: the fastest you can pull the limit without stalling first */
  manoeuvreSpeed: number
  /** Design dive speed (m/s) */
  diveSpeed: number
  limitLoadPositive: number
  limitLoadNegative: number
  /** The upper boundary of the envelope, left to right */
  positiveBoundary: VnPoint[]
  /** The lower boundary, left to right */
  negativeBoundary: VnPoint[]
  /** Load factor the wing is actually pulling right now */
  currentLoadFactor: number
  /** Current airspeed, for placing the operating point */
  currentSpeed: number
  /** True when the current condition sits outside the envelope */
  outsideEnvelope: boolean
}

/**
 * Find where the wing stalls, exactly rather than by search.
 *
 * Section lift is affine in incidence, so two evaluations give every station's
 * line and each line can be solved for its own stall angle in closed form.
 */
export function wingStall(
  solution: LiftingLineSolution,
  sectionClMax: number,
): WingStall {
  const low = atAlpha(solution, 0)
  const high = atAlpha(solution, 10)

  let alphaStall = Infinity
  let criticalEta = 0

  for (let i = 0; i < low.stations.length; i++) {
    const at0 = low.stations[i].cl
    const slope = (high.stations[i].cl - at0) / 10
    if (slope <= 1e-9) continue

    const alpha = (sectionClMax - at0) / slope
    if (alpha < alphaStall) {
      alphaStall = alpha
      criticalEta = low.stations[i].eta
    }
  }

  if (!Number.isFinite(alphaStall)) {
    return { clMax: 0, alphaStall: 0, criticalEta: 0, stallsAtTip: false }
  }

  return {
    clMax: atAlpha(solution, alphaStall).cl,
    alphaStall,
    criticalEta,
    stallsAtTip: Math.abs(criticalEta) > 0.7,
  }
}

export function flightEnvelope(
  solution: LiftingLineSolution,
  params: AircraftParams,
  sectionClMax: number,
): FlightEnvelope {
  const { wing, operating } = params
  const geometry = planform(wing)
  const air = atmosphere(operating.altitude)
  const stall = wingStall(solution, sectionClMax)

  const weight = operating.mass * G
  const wingLoading = weight / geometry.area

  // n = 1 stall: the speed at which C_Lmax is exactly enough to hold you up.
  const speedFor = (clMax: number, n: number) =>
    clMax > 0 ? Math.sqrt((2 * Math.abs(n) * wingLoading) / (air.density * clMax)) : 0

  const stallSpeed = speedFor(stall.clMax, 1)
  const invertedStallSpeed = speedFor(stall.clMax * INVERTED_CLMAX_FRACTION, 1)

  const manoeuvreSpeed = stallSpeed * Math.sqrt(LIMIT_LOAD_POSITIVE)
  const negativeManoeuvreSpeed =
    invertedStallSpeed * Math.sqrt(Math.abs(LIMIT_LOAD_NEGATIVE))

  // Dive speed is a property of the design, not of the throttle setting. Tying
  // it to the current airspeed made the envelope reshape itself every time you
  // flew faster, and made "faster than V_D" unreachable by construction. Light
  // aircraft typically sit near 3.7 stall speeds, which is what this works out
  // to via the manoeuvre speed.
  const diveSpeed = manoeuvreSpeed * DIVE_SPEED_FACTOR

  const positiveBoundary: VnPoint[] = []
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const v = (manoeuvreSpeed * i) / steps
    positiveBoundary.push({ v, n: stallSpeed > 0 ? (v / stallSpeed) ** 2 : 0 })
  }
  positiveBoundary.push({ v: diveSpeed, n: LIMIT_LOAD_POSITIVE })
  positiveBoundary.push({ v: diveSpeed, n: 0 })

  const negativeBoundary: VnPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const v = (negativeManoeuvreSpeed * i) / steps
    negativeBoundary.push({
      v,
      n: invertedStallSpeed > 0 ? -((v / invertedStallSpeed) ** 2) : 0,
    })
  }
  negativeBoundary.push({ v: diveSpeed * NEGATIVE_PLATEAU_END, n: LIMIT_LOAD_NEGATIVE })
  negativeBoundary.push({ v: diveSpeed, n: 0 })

  const current = atAlpha(solution, operating.alpha)
  const q = 0.5 * air.density * operating.speed * operating.speed
  const currentLoadFactor = weight > 0 ? (q * geometry.area * current.cl) / weight : 0

  const outsideEnvelope =
    currentLoadFactor > LIMIT_LOAD_POSITIVE ||
    currentLoadFactor < LIMIT_LOAD_NEGATIVE ||
    operating.speed > diveSpeed ||
    (stallSpeed > 0 && currentLoadFactor > (operating.speed / stallSpeed) ** 2 + 1e-9)

  return {
    ...stall,
    stallSpeed,
    manoeuvreSpeed,
    diveSpeed,
    limitLoadPositive: LIMIT_LOAD_POSITIVE,
    limitLoadNegative: LIMIT_LOAD_NEGATIVE,
    positiveBoundary,
    negativeBoundary,
    currentLoadFactor,
    currentSpeed: operating.speed,
    outsideEnvelope,
  }
}
