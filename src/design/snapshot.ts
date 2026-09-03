/**
 * A design, and everything that follows from it.
 *
 * The studio only ever holds one of these at a time, but saving, comparing and
 * checking a design against a brief all want the same bundle - so it is a type
 * rather than three separate arguments passed around in the same order.
 */

import { evaluateWith, type AeroResults } from '../aero/evaluate'
import type { AircraftParams } from '../aero/params'
import { dragPolarWith, type DragPolar } from '../aero/polar'
import { factorSurface } from '../aero/solver'

export interface DesignSnapshot {
  params: AircraftParams
  results: AeroResults
  polar: DragPolar
}

/**
 * Evaluate a design from its parameters.
 *
 * One factorisation feeds both the point results and the polar - the expensive
 * part of the solve depends only on the wing's shape, so doing it twice would
 * be waste.
 */
export function analyse(params: AircraftParams): DesignSnapshot {
  const solution = factorSurface(params.wing, params.solver)

  return {
    params,
    results: evaluateWith(solution, params),
    polar: dragPolarWith(solution, params),
  }
}
