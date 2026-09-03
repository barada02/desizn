/**
 * The one function everything else calls.
 *
 * Parameters in, results out, no side effects and no dependencies on React,
 * Three.js or the DOM. The slider panel calls it, the charts read what it
 * returns, and an agent will eventually call the very same function without
 * touching the screen.
 */

import { atmosphere, dynamicPressure, reynolds, type Atmosphere } from './atmosphere'
import { sectionProperties } from './airfoil'
import { dragBuildup, type DragBuildup } from './drag'
import { flightEnvelope, type FlightEnvelope } from './envelope'
import { stability as computeStability, type Stability } from './stability'
import {
  atAlpha,
  factorWing,
  type LiftingLineSolution,
  type SpanStation,
} from './llt'
import { DEG, type AircraftParams } from './params'
import { planform, thicknessRatio, wingLoading, type Planform } from './planform'

export interface AeroResults {
  geometry: Planform
  air: Atmosphere
  drag: DragBuildup

  /** Dynamic pressure (Pa) */
  dynamicPressure: number
  /** Wing loading, W/S (N/m^2) */
  wingLoading: number

  /** Lift coefficient at the current angle of attack */
  cl: number
  /** Lift-curve slope, per radian */
  clAlpha: number
  /** Total drag coefficient */
  cd: number
  /** Lift to drag ratio at the current condition */
  liftToDrag: number
  /** Span efficiency, 1.0 only for an elliptical load */
  spanEfficiency: number
  /** The penalty carried by every harmonic above the first */
  delta: number

  /** Lift force (N) */
  lift: number
  /** Drag force (N) */
  dragForce: number

  /** The lift coefficient this mass needs to hold level flight here */
  clRequired: number
  /** The angle of attack that would deliver it (deg) */
  alphaForLevelFlight: number
  /** Angle of attack at which this wing makes no lift (deg) */
  zeroLiftAlpha: number
  /** True when the wing is making at least the lift it needs to fly level */
  sustainsLevelFlight: boolean
  /** Highest section lift coefficient anywhere on the span */
  maxSectionCl: number
  /** True where the linear theory behind these numbers can no longer be trusted */
  beyondLinear: boolean
  /** The section stall estimate that judgement was made against */
  sectionClMax: number

  /** Longitudinal stability: neutral point, static margin and the tail behind them */
  stability: Stability
  /** Stall, limit loads and the V-n envelope */
  envelope: FlightEnvelope

  stations: SpanStation[]
}

/**
 * Evaluate a wing that has already been factored. The store uses this so one
 * factorisation feeds both the results and the whole drag polar.
 */
export function evaluateWith(
  solution: LiftingLineSolution,
  params: AircraftParams,
): AeroResults {
  const { wing, operating } = params

  const geometry = planform(wing)
  const air = atmosphere(operating.altitude)
  const q = dynamicPressure(air.density, operating.speed)

  const lifting = atAlpha(solution, operating.alpha)

  const drag = dragBuildup({
    reynolds: reynolds(air, operating.speed, geometry.mac),
    thicknessRatio: thicknessRatio(wing.naca),
    wettedArea: geometry.wettedArea,
    referenceArea: geometry.area,
    cdi: lifting.cdi,
  })

  const lift = q * geometry.area * lifting.cl
  const dragForce = q * geometry.area * drag.cd
  const weight = operating.mass * 9.80665
  const clRequired = weight / (q * geometry.area)

  const sectionClMax = sectionProperties(wing.naca).clMax
  let maxSectionCl = 0
  for (const station of lifting.stations) {
    const magnitude = Math.abs(station.cl)
    if (magnitude > maxSectionCl) maxSectionCl = magnitude
  }

  // C_L is affine in alpha, so the angle that delivers a given C_L is exact
  // rather than something to iterate towards.
  const alphaForLevelFlight =
    lifting.zeroLiftAlpha + clRequired / lifting.clAlpha / DEG

  return {
    geometry,
    air,
    drag,
    dynamicPressure: q,
    wingLoading: wingLoading(operating.mass, geometry.area),
    cl: lifting.cl,
    clAlpha: lifting.clAlpha,
    cd: drag.cd,
    liftToDrag: drag.cd > 0 ? lifting.cl / drag.cd : 0,
    spanEfficiency: lifting.spanEfficiency,
    delta: lifting.delta,
    lift,
    dragForce,
    clRequired,
    alphaForLevelFlight,
    zeroLiftAlpha: lifting.zeroLiftAlpha,
    sustainsLevelFlight: lift >= weight,
    maxSectionCl,
    beyondLinear: maxSectionCl > sectionClMax,
    sectionClMax,
    stability: computeStability(wing, params.tail, params.balance, lifting.clAlpha),
    envelope: flightEnvelope(solution, params, sectionClMax),
    stations: lifting.stations,
  }
}

export function evaluate(params: AircraftParams): AeroResults {
  return evaluateWith(factorWing(params.wing), params)
}
