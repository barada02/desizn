/**
 * Which theory is doing the work.
 *
 * Both solvers return the same result shape, so everything downstream - the
 * polar, the envelope, the stability calculation, the charts - is written once
 * and does not care which one produced the numbers.
 *
 * Keeping both is not indecision. Lifting-line theory is the classical result,
 * exact for an elliptical wing and quick to reason about, but it is blind to
 * sweep and dihedral and falls apart below about aspect ratio four. The lattice
 * sees the geometry but reads a few percent under a converged lifting-surface
 * solution with a single chordwise row. Being able to switch between them shows
 * exactly where a model's assumptions stop holding, which is worth more than
 * quietly picking one.
 */

import { atAlpha, factorWing, type LiftingLineResult } from './llt'
import type { WingParams } from './params'
import { factorWingVlm, vlmAtAlpha } from './vlm'

export type SolverKind = 'lifting-line' | 'vortex-lattice'

export interface SolverInfo {
  label: string
  short: string
  /** What this solver can and cannot account for */
  blurb: string
  seesSweep: boolean
}

export const SOLVERS: Record<SolverKind, SolverInfo> = {
  'lifting-line': {
    label: 'Lifting line',
    short: 'LLT',
    blurb:
      'Prandtl, 1918. Exact for an elliptical wing and fast to reason about, but it models the wing as a single straight line - so sweep and dihedral change the picture and nothing else. Loses accuracy below about aspect ratio four.',
    seesSweep: false,
  },
  'vortex-lattice': {
    label: 'Vortex lattice',
    short: 'VLM',
    blurb:
      'Horseshoe vortices laid along the real quarter-chord line, so sweep and dihedral affect the answer. Holds up at low aspect ratio where lifting-line theory does not. With one chordwise row it reads a few percent under a fully converged solution.',
    seesSweep: true,
  },
}

export const DEFAULT_SOLVER: SolverKind = 'vortex-lattice'

/** A factored surface: hand it any angle of attack, as often as you like. */
export interface SurfaceSolution {
  kind: SolverKind
  at: (alpha: number) => LiftingLineResult
}

function build(wing: WingParams, kind: SolverKind): SurfaceSolution {
  if (kind === 'vortex-lattice') {
    const solution = factorWingVlm(wing)
    return { kind, at: (alpha) => vlmAtAlpha(solution, alpha) }
  }

  const solution = factorWing(wing)
  return { kind, at: (alpha) => atAlpha(solution, alpha) }
}

/**
 * Factoring depends only on the wing's shape, but the studio recomputes
 * everything whenever any parameter moves - including airspeed, altitude, mass
 * and incidence, none of which can change it. Those are also the sliders most
 * likely to be dragged.
 *
 * A single-entry cache keyed on the parameter object's identity is enough,
 * because the store only builds a new wing object when the wing actually
 * changes. Flight-condition drags then cost nothing but the evaluation.
 */
let cachedWing: WingParams | null = null
let cachedKind: SolverKind | null = null
let cachedSolution: SurfaceSolution | null = null

export function factorSurface(
  wing: WingParams,
  kind: SolverKind = DEFAULT_SOLVER,
): SurfaceSolution {
  if (cachedWing !== wing || cachedKind !== kind || cachedSolution === null) {
    cachedWing = wing
    cachedKind = kind
    cachedSolution = build(wing, kind)
  }
  return cachedSolution
}
