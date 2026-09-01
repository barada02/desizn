/**
 * The one function everything else calls.
 *
 * Parameters in, results out, no side effects and no dependencies on React,
 * Three.js or the DOM. The slider panel calls it, the charts read what it
 * returns, and an agent will eventually call the very same function without
 * touching the screen.
 */

import { atmosphere, dynamicPressure, reynolds, type Atmosphere } from './atmosphere'
import { dragBuildup, type DragBuildup } from './drag'
import { solveWing, type SpanStation } from './llt'
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

  stations: SpanStation[]
}

export function evaluate(params: AircraftParams): AeroResults {
  const { wing, operating } = params

  const geometry = planform(wing)
  const air = atmosphere(operating.altitude)
  const q = dynamicPressure(air.density, operating.speed)

  const lifting = solveWing(wing, operating)

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
    stations: lifting.stations,
  }
}
