/**
 * Prandtl's lifting-line theory.
 *
 * The circulation across the span is written as a Fourier sine series,
 *
 *   Gamma(theta) = 2 b V * sum_n A_n sin(n theta),   y = -(b/2) cos(theta)
 *
 * and the monoplane equation is enforced at a set of collocation stations:
 *
 *   sum_n A_n sin(n theta) [ 4b / (a_0 c) + n / sin(theta) ]
 *       = alpha_geometric(theta) - alpha_L0(theta)
 *
 * Everything worth knowing then falls out of the coefficients: the first one
 * makes all of the lift, and every higher one is wasted energy.
 *
 * The system is linear in the right-hand side, which is worth exploiting. The
 * angle of attack enters the right-hand side as a constant, so we factor the
 * matrix once and solve it twice - once for a unit angle of attack and once for
 * the twist and camber alone. Superposing the two gives the answer at any
 * alpha, and the lift-curve slope exactly rather than by finite difference.
 */

import { sectionProperties, type SectionProperties } from './airfoil'
import { chordAt, planform, twistAt } from './planform'
import { DEG, type OperatingParams, type WingParams } from './params'

/**
 * A wing described by distributions rather than by parameters, so the solver
 * can be handed shapes the parameter model cannot express - an elliptical
 * planform, for instance, which is how we check it against theory.
 */
export interface LiftingLineInput {
  /** b (m) */
  span: number
  /** S (m^2) */
  area: number
  /** Local chord at spanwise station y (m) */
  chord: (y: number) => number
  /** Local geometric twist relative to the root (deg) */
  twist: (y: number) => number
  /** Local section properties */
  section: (y: number) => SectionProperties
  /** Root angle of attack (deg) */
  alpha: number
  /** Collocation stations; odd values put one exactly at the root */
  stations?: number
}

export interface SpanStation {
  /** Spanwise position from the centreline (m) */
  y: number
  /** y / (b/2), so -1 at the port tip and +1 at the starboard tip */
  eta: number
  /** Local chord (m) */
  chord: number
  /** Section lift coefficient */
  cl: number
  /** Circulation divided by freestream speed, Gamma/V (m) */
  gamma: number
  /** Circulation normalised to the centreline value */
  load: number
  /** The elliptical load with the same root value, for comparison */
  elliptical: number
}

export interface LiftingLineResult {
  /** Wing lift coefficient */
  cl: number
  /** Lift-curve slope, per radian */
  clAlpha: number
  /** Induced drag coefficient */
  cdi: number
  /** Span efficiency, e = 1/(1+delta); 1.0 only for an elliptical load */
  spanEfficiency: number
  /** delta - the penalty carried by every harmonic above the first */
  delta: number
  /** Angle of attack at which this wing makes no lift (deg) */
  zeroLiftAlpha: number
  /** Fourier coefficients A_n */
  coefficients: number[]
  stations: SpanStation[]
  aspectRatio: number
}

const DEFAULT_STATIONS = 61

/** LU decomposition with partial pivoting, in place on a copy. */
function luDecompose(matrix: number[][]): { lu: number[][]; pivot: number[] } {
  const n = matrix.length
  const lu = matrix.map((row) => row.slice())
  const pivot = Array.from({ length: n }, (_, i) => i)

  for (let k = 0; k < n; k++) {
    let best = k
    let bestValue = Math.abs(lu[k][k])
    for (let i = k + 1; i < n; i++) {
      const value = Math.abs(lu[i][k])
      if (value > bestValue) {
        best = i
        bestValue = value
      }
    }

    if (best !== k) {
      const swap = lu[k]
      lu[k] = lu[best]
      lu[best] = swap
      const p = pivot[k]
      pivot[k] = pivot[best]
      pivot[best] = p
    }

    const diagonal = lu[k][k]
    if (diagonal === 0) continue

    for (let i = k + 1; i < n; i++) {
      const factor = (lu[i][k] /= diagonal)
      if (factor === 0) continue
      for (let j = k + 1; j < n; j++) {
        lu[i][j] -= factor * lu[k][j]
      }
    }
  }

  return { lu, pivot }
}

function luSolve(lu: number[][], pivot: number[], rhs: number[]): number[] {
  const n = lu.length
  const x = new Array<number>(n)

  for (let i = 0; i < n; i++) {
    let sum = rhs[pivot[i]]
    for (let j = 0; j < i; j++) sum -= lu[i][j] * x[j]
    x[i] = sum
  }

  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i]
    for (let j = i + 1; j < n; j++) sum -= lu[i][j] * x[j]
    x[i] = lu[i][i] === 0 ? 0 : sum / lu[i][i]
  }

  return x
}

export function solveLiftingLine(input: LiftingLineInput): LiftingLineResult {
  const { span, area } = input
  const n = input.stations ?? DEFAULT_STATIONS
  const halfSpan = span / 2
  const aspectRatio = (span * span) / area

  const thetas: number[] = []
  const ys: number[] = []
  for (let k = 1; k <= n; k++) {
    const theta = (k * Math.PI) / (n + 1)
    thetas.push(theta)
    ys.push(-halfSpan * Math.cos(theta))
  }

  // Coefficient matrix, plus the two right-hand sides we superpose later.
  const matrix: number[][] = []
  const rhsAlpha: number[] = []
  const rhsShape: number[] = []

  for (let k = 0; k < n; k++) {
    const theta = thetas[k]
    const y = ys[k]
    const chord = input.chord(y)
    const section = input.section(y)
    const sinTheta = Math.sin(theta)

    const row = new Array<number>(n)
    const chordTerm = (4 * span) / (section.liftSlope * chord)

    for (let j = 0; j < n; j++) {
      const order = j + 1
      row[j] = Math.sin(order * theta) * (chordTerm + order / sinTheta)
    }

    matrix.push(row)
    // alpha_root contributes 1 per unit angle; twist and camber are fixed.
    rhsAlpha.push(1)
    rhsShape.push(input.twist(y) * DEG - section.zeroLiftAlpha)
  }

  const { lu, pivot } = luDecompose(matrix)
  const perAlpha = luSolve(lu, pivot, rhsAlpha)
  const fromShape = luSolve(lu, pivot, rhsShape)

  const alphaRad = input.alpha * DEG
  const coefficients = perAlpha.map((a, i) => alphaRad * a + fromShape[i])

  const a1 = coefficients[0]
  const cl = Math.PI * aspectRatio * a1
  const clAlpha = Math.PI * aspectRatio * perAlpha[0]

  // delta is a ratio of coefficients, so it is meaningless when there is no
  // lift to speak of. At that point there is no induced drag either.
  let delta = 0
  const meaningfulLift = Math.abs(a1) > 1e-10
  if (meaningfulLift) {
    for (let j = 1; j < n; j++) {
      const ratio = coefficients[j] / a1
      delta += (j + 1) * ratio * ratio
    }
  }

  const spanEfficiency = 1 / (1 + delta)
  const cdi = meaningfulLift ? (cl * cl) / (Math.PI * aspectRatio * spanEfficiency) : 0

  // The wing makes no lift where the alpha contribution cancels the shape one.
  const zeroLiftAlpha =
    Math.abs(perAlpha[0]) > 1e-12 ? -(fromShape[0] / perAlpha[0]) / DEG : 0

  const gammaAt = (theta: number): number => {
    let sum = 0
    for (let j = 0; j < n; j++) sum += coefficients[j] * Math.sin((j + 1) * theta)
    return 2 * span * sum
  }

  const rootGamma = gammaAt(Math.PI / 2)
  const stations: SpanStation[] = thetas.map((theta, k) => {
    const y = ys[k]
    const chord = input.chord(y)
    const gamma = gammaAt(theta)
    const eta = y / halfSpan

    return {
      y,
      eta,
      chord,
      gamma,
      // l = rho V Gamma = 1/2 rho V^2 c cl, so cl = 2 (Gamma/V) / c
      cl: (2 * gamma) / chord,
      load: Math.abs(rootGamma) > 1e-12 ? gamma / rootGamma : 0,
      elliptical: Math.sqrt(Math.max(0, 1 - eta * eta)),
    }
  })

  return {
    cl,
    clAlpha,
    cdi,
    spanEfficiency,
    delta,
    zeroLiftAlpha,
    coefficients,
    stations,
    aspectRatio,
  }
}

/** Build the solver input from the studio's parameters and run it. */
export function solveWing(
  wing: WingParams,
  operating: OperatingParams,
): LiftingLineResult {
  const geometry = planform(wing)
  const section = sectionProperties(wing.naca)

  return solveLiftingLine({
    span: wing.span,
    area: geometry.area,
    chord: (y) => chordAt(wing, y),
    twist: (y) => twistAt(wing, y),
    section: () => section,
    alpha: operating.alpha,
  })
}
