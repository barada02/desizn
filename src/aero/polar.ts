/**
 * The drag polar: what this wing costs at every angle it can be flown at.
 *
 * The whole sweep comes from a single matrix factorisation. Angle of attack
 * only ever entered the right-hand side, so once the wing's shape is factored
 * each point on the curve is a handful of multiplications - which is why this
 * runs on every slider tick without a worker.
 *
 * One honesty caveat is built in. Lifting-line theory is linear: it has no idea
 * that a section eventually stalls, and left alone it will happily promise lift
 * at angles no real wing survives. Every point therefore carries the highest
 * section lift coefficient anywhere on the span, and points past the limit
 * where a NACA 4-digit section departs from linear are flagged rather than
 * quietly drawn.
 */

import { sectionProperties } from './airfoil'
import { factorSurface, type SurfaceSolution } from './solver'
import { atmosphere, reynolds } from './atmosphere'
import { dragBuildup } from './drag'
import { OPERATING_BOUNDS, type AircraftParams } from './params'
import { planform, thicknessRatio } from './planform'

export interface PolarPoint {
  /** Angle of attack (deg) */
  alpha: number
  cl: number
  cd: number
  cd0: number
  cdi: number
  liftToDrag: number
  /** Highest section lift coefficient anywhere on the span */
  maxSectionCl: number
  /** True where linear theory can no longer be trusted */
  beyondLinear: boolean
}

export interface DragPolar {
  points: PolarPoint[]
  /** Best lift-to-drag ratio the wing can reach while still behaving linearly */
  bestLiftToDrag: PolarPoint
  /** Lowest total drag coefficient */
  minimumDrag: PolarPoint
  /** Where the current flight condition sits */
  current: PolarPoint
  /** Profile drag, constant along the sweep at a fixed speed and altitude */
  cd0: number
  /** The first angle at which linear theory gives out, if it does in range */
  linearLimitAlpha: number | null
  /** The section stall estimate this sweep was judged against */
  sectionClMax: number
}

export interface PolarOptions {
  /** Angle step through the sweep (deg) */
  step?: number
}

/** Sweep a wing that has already been factored. */
export function dragPolarWith(
  solution: SurfaceSolution,
  params: AircraftParams,
  options: PolarOptions = {},
): DragPolar {
  const { wing, operating } = params
  const step = options.step ?? 0.5

  const geometry = planform(wing)
  const air = atmosphere(operating.altitude)
  const clMax = sectionProperties(wing.naca).clMax

  // Profile drag depends on Reynolds number and shape, not on incidence, so it
  // is the same at every point of the sweep.
  const cd0 = dragBuildup({
    reynolds: reynolds(air, operating.speed, geometry.mac),
    thicknessRatio: thicknessRatio(wing.naca),
    wettedArea: geometry.wettedArea,
    referenceArea: geometry.area,
    cdi: 0,
  }).cd0

  const pointAt = (alpha: number): PolarPoint => {
    const lift = solution.at(alpha)
    const cd = cd0 + lift.cdi

    let maxSectionCl = 0
    for (const station of lift.stations) {
      const magnitude = Math.abs(station.cl)
      if (magnitude > maxSectionCl) maxSectionCl = magnitude
    }

    return {
      alpha,
      cl: lift.cl,
      cd,
      cd0,
      cdi: lift.cdi,
      liftToDrag: cd > 0 ? lift.cl / cd : 0,
      maxSectionCl,
      beyondLinear: maxSectionCl > clMax,
    }
  }

  const bound = OPERATING_BOUNDS.alpha
  const points: PolarPoint[] = []
  for (let alpha = bound.min; alpha <= bound.max + 1e-9; alpha += step) {
    points.push(pointAt(Number(alpha.toFixed(4))))
  }

  const usable = points.filter((p) => !p.beyondLinear)
  const searchable = usable.length > 0 ? usable : points

  const bestLiftToDrag = searchable.reduce((a, b) =>
    b.liftToDrag > a.liftToDrag ? b : a,
  )
  const minimumDrag = searchable.reduce((a, b) => (b.cd < a.cd ? b : a))
  const firstBeyond = points.find((p) => p.beyondLinear && p.alpha > 0)

  return {
    points,
    bestLiftToDrag,
    minimumDrag,
    current: pointAt(operating.alpha),
    cd0,
    linearLimitAlpha: firstBeyond ? firstBeyond.alpha : null,
    sectionClMax: clMax,
  }
}

export function dragPolar(
  params: AircraftParams,
  options?: PolarOptions,
): DragPolar {
  return dragPolarWith(factorSurface(params.wing, params.solver), params, options)
}
