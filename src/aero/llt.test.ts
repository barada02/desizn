import { describe, expect, it } from 'vitest'
import { SECTION_LIFT_SLOPE, sectionProperties } from './airfoil'
import { solveLiftingLine, solveWing, type LiftingLineInput } from './llt'
import { DEFAULT_PARAMS, type WingParams } from './params'
import { planform } from './planform'

const symmetric = sectionProperties('0012')

/** A wing with a given planform law, no twist and a symmetric section. */
function bare(
  span: number,
  area: number,
  chord: (y: number) => number,
  alpha: number,
  stations?: number,
): LiftingLineInput {
  return {
    span,
    area,
    chord,
    twist: () => 0,
    section: () => symmetric,
    alpha,
    stations,
  }
}

function elliptical(span: number, rootChord: number, alpha: number, stations?: number) {
  const halfSpan = span / 2
  return bare(
    span,
    (Math.PI * span * rootChord) / 4,
    (y) => rootChord * Math.sqrt(Math.max(0, 1 - (y / halfSpan) ** 2)),
    alpha,
    stations,
  )
}

function rectangular(span: number, chord: number, alpha: number) {
  return bare(span, span * chord, () => chord, alpha)
}

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  ...over,
})

describe('the elliptical wing, which theory pins down exactly', () => {
  it('carries all of its load in the first harmonic', () => {
    const result = solveLiftingLine(elliptical(10, 1.2732395, 5))

    expect(result.delta).toBeLessThan(1e-3)
    expect(result.spanEfficiency).toBeCloseTo(1, 2)
  })

  it('matches the closed-form lift-curve slope a0 / (1 + a0/(pi AR))', () => {
    // For an elliptical wing lifting-line theory has an exact answer, so this
    // checks the whole solve - matrix, factorisation and coefficients - against
    // something independent of the code.
    for (const span of [8, 12, 20]) {
      const input = elliptical(span, 1.2732395, 4)
      const result = solveLiftingLine(input)
      const expected =
        SECTION_LIFT_SLOPE /
        (1 + SECTION_LIFT_SLOPE / (Math.PI * result.aspectRatio))

      expect(result.clAlpha).toBeCloseTo(expected, 3)
    }
  })

  it('reproduces the elliptical load distribution it was given', () => {
    const result = solveLiftingLine(elliptical(10, 1.2732395, 5))

    for (const station of result.stations) {
      expect(station.load).toBeCloseTo(station.elliptical, 2)
    }
  })

  it('gives every section the same lift coefficient', () => {
    // The hallmark of elliptical loading: no section works harder than another.
    const result = solveLiftingLine(elliptical(10, 1.2732395, 6))
    const middle = result.stations.filter((s) => Math.abs(s.eta) < 0.9)

    for (const station of middle) {
      expect(station.cl).toBeCloseTo(result.cl, 2)
    }
  })
})

describe('the rectangular wing, which is measurably worse', () => {
  it('lands in the published span-efficiency range at AR 6', () => {
    const result = solveLiftingLine(rectangular(6, 1, 5))

    expect(result.aspectRatio).toBeCloseTo(6, 10)
    expect(result.spanEfficiency).toBeGreaterThan(0.92)
    expect(result.spanEfficiency).toBeLessThan(0.97)
  })

  it('is always less efficient than the ellipse', () => {
    for (const aspect of [4, 6, 8, 12]) {
      const rect = solveLiftingLine(rectangular(aspect, 1, 5))
      expect(rect.spanEfficiency).toBeLessThan(0.999)
      expect(rect.delta).toBeGreaterThan(0)
    }
  })

  it('works its root harder than its tip, unlike a tapered wing', () => {
    // On a constant-chord wing cl follows the circulation directly, so it peaks
    // at the root and falls away to nothing at the tip. Taper reverses that -
    // the chord shrinks faster than the load does - which is why tapered wings
    // stall at the tip first and why washout exists.
    const outboardRatio = (taper: number) => {
      const w = wing({ span: 8, rootChord: 1, taper, sweepQuarter: 0, twist: 0, naca: '0012' })
      const result = solveWing(w, { ...DEFAULT_PARAMS.operating, alpha: 5 })
      const root = result.stations.find((s) => Math.abs(s.eta) < 0.02)!
      const outboard = result.stations.reduce((a, b) =>
        Math.abs(b.eta - 0.8) < Math.abs(a.eta - 0.8) ? b : a,
      )
      return outboard.cl / root.cl
    }

    expect(outboardRatio(1)).toBeLessThan(1)
    expect(outboardRatio(0.25)).toBeGreaterThan(outboardRatio(1))
  })
})

describe('linearity and symmetry', () => {
  it('makes no lift at zero incidence with a symmetric section', () => {
    const result = solveLiftingLine(rectangular(10, 1, 0))

    expect(result.cl).toBeCloseTo(0, 12)
    expect(result.cdi).toBeCloseTo(0, 12)
  })

  it('is affine in angle of attack', () => {
    const w = wing({ twist: -3, naca: '2412' })
    const at = (alpha: number) => solveWing(w, { ...DEFAULT_PARAMS.operating, alpha })

    const a0 = at(0)
    const a5 = at(5)
    const a10 = at(10)

    expect(a10.cl - a5.cl).toBeCloseTo(a5.cl - a0.cl, 10)
    // The slope the solver reports is the slope it actually delivers.
    expect((a5.cl - a0.cl) / (5 * (Math.PI / 180))).toBeCloseTo(a0.clAlpha, 8)
  })

  it('reports a zero-lift angle where the lift really is zero', () => {
    const w = wing({ twist: -2, naca: '2412' })
    const guess = solveWing(w, { ...DEFAULT_PARAMS.operating, alpha: 0 })
    const atZeroLift = solveWing(w, {
      ...DEFAULT_PARAMS.operating,
      alpha: guess.zeroLiftAlpha,
    })

    expect(atZeroLift.cl).toBeCloseTo(0, 10)
  })

  it('loads both half-wings identically', () => {
    const result = solveWing(wing({ twist: -4 }), DEFAULT_PARAMS.operating)
    const n = result.stations.length

    for (let i = 0; i < n; i++) {
      expect(result.stations[i].load).toBeCloseTo(result.stations[n - 1 - i].load, 8)
    }
  })
})

describe('what the sliders are supposed to teach', () => {
  it('finds the span efficiency peak near the taper ratio the books give', () => {
    // For an unswept wing the load comes closest to elliptical somewhere near
    // lambda = 0.4. This is the payoff of the whole app, so it is worth a test.
    const w = wing({ span: 10, rootChord: 1.25, sweepQuarter: 0, twist: 0, naca: '0012' })

    let bestTaper = 0
    let bestEfficiency = 0
    for (let taper = 0.2; taper <= 1.0001; taper += 0.01) {
      const result = solveWing({ ...w, taper }, { ...DEFAULT_PARAMS.operating, alpha: 5 })
      if (result.spanEfficiency > bestEfficiency) {
        bestEfficiency = result.spanEfficiency
        bestTaper = taper
      }
    }

    expect(bestTaper).toBeGreaterThan(0.3)
    expect(bestTaper).toBeLessThan(0.5)
    expect(bestEfficiency).toBeGreaterThan(0.98)
  })

  it('moves the best taper toward a squarer wing as washout is added', () => {
    // Washout unloads the tips. A sharply tapered wing already carries little
    // load out there, so washout pushes it further from elliptical; a squarer
    // wing carries too much, so washout corrects it. The two controls have to
    // be set together, which is why the slider help says so.
    const bestTaperFor = (twist: number) => {
      let bestTaper = 0
      let best = 0
      for (let taper = 0.2; taper <= 1.0001; taper += 0.02) {
        const result = solveWing(
          { ...wing({ sweepQuarter: 0, naca: '0012' }), taper, twist },
          { ...DEFAULT_PARAMS.operating, alpha: 5 },
        )
        if (result.spanEfficiency > best) {
          best = result.spanEfficiency
          bestTaper = taper
        }
      }
      return bestTaper
    }

    expect(bestTaperFor(-4)).toBeGreaterThan(bestTaperFor(-2))
    expect(bestTaperFor(-2)).toBeGreaterThan(bestTaperFor(0))
  })

  it('raises span efficiency when span grows at constant area', () => {
    const alpha = { ...DEFAULT_PARAMS.operating, alpha: 5 }
    const short = solveWing(wing({ span: 8, rootChord: 1.5 }), alpha)
    const long = solveWing(wing({ span: 16, rootChord: 0.75 }), alpha)

    expect(long.aspectRatio).toBeGreaterThan(short.aspectRatio)
    expect(long.cdi).toBeLessThan(short.cdi)
  })

  it('unloads the tip when washout is applied', () => {
    const operating = { ...DEFAULT_PARAMS.operating, alpha: 6 }
    const tipOf = (twist: number) => {
      const result = solveWing(wing({ twist, naca: '0012' }), operating)
      return result.stations.reduce((a, b) =>
        Math.abs(b.eta - 0.85) < Math.abs(a.eta - 0.85) ? b : a,
      ).cl
    }

    expect(tipOf(-6)).toBeLessThan(tipOf(0))
  })
})

describe('numerics', () => {
  it('has converged by the default station count', () => {
    const coarse = solveLiftingLine(elliptical(10, 1.2732395, 5, 61))
    const fine = solveLiftingLine(elliptical(10, 1.2732395, 5, 201))

    expect(coarse.cl).toBeCloseTo(fine.cl, 4)
    expect(coarse.spanEfficiency).toBeCloseTo(fine.spanEfficiency, 3)
  })

  it('agrees with the closed-form induced drag it reports', () => {
    const result = solveWing(wing(), { ...DEFAULT_PARAMS.operating, alpha: 5 })
    const expected =
      (result.cl * result.cl) /
      (Math.PI * result.aspectRatio * result.spanEfficiency)

    expect(result.cdi).toBeCloseTo(expected, 12)
  })

  it('reports the same aspect ratio as the planform module', () => {
    const w = wing({ span: 13.2, rootChord: 1.1, taper: 0.62 })
    expect(solveWing(w, DEFAULT_PARAMS.operating).aspectRatio).toBeCloseTo(
      planform(w).aspectRatio,
      10,
    )
  })
})
