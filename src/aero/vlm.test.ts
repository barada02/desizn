import { describe, expect, it } from 'vitest'
import { atAlpha, factorWing } from './llt'
import { DEFAULT_PARAMS, type WingParams } from './params'
import {
  buildLattice,
  factorLattice,
  factorWingVlm,
  vlmAtAlpha,
  type LatticeGeometry,
} from './vlm'

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  sweepQuarter: 0,
  dihedral: 0,
  twist: 0,
  naca: '0012',
  ...over,
})

/** A flat elliptical wing - the one planform theory pins down exactly. */
function elliptical(span: number, rootChord: number): LatticeGeometry {
  return {
    span,
    area: (Math.PI * span * rootChord) / 4,
    station: (y) => ({
      chord: rootChord * Math.sqrt(Math.max(0, 1 - (2 * y) / span * ((2 * y) / span))),
      quarterChordX: 0,
      z: 0,
      incidence: 0,
      dihedral: 0,
    }),
  }
}

const solveElliptical = (span: number, alpha: number, panels = 200) =>
  vlmAtAlpha(factorLattice(buildLattice(elliptical(span, 1.2732395), panels)), alpha)

const solveWingVlm = (w: WingParams, alpha: number, panels = 120) =>
  vlmAtAlpha(factorWingVlm(w, panels), alpha)

/** Helmbold's lifting-surface estimate, valid down to very low aspect ratio. */
const helmbold = (aspectRatio: number) =>
  (2 * Math.PI * aspectRatio) / (2 + Math.sqrt(aspectRatio * aspectRatio + 4))

describe('the elliptical wing', () => {
  it('recovers a span efficiency of one', () => {
    // The induced drag comes out of a Trefftz-plane integration that knows
    // nothing about this expectation, so hitting 1.0 checks the whole wake
    // treatment - shed strengths, signs and the factor in front.
    const result = solveElliptical(10, 5, 300)

    expect(result.spanEfficiency).toBeGreaterThan(0.99)
    expect(result.spanEfficiency).toBeLessThan(1.01)
  })

  it('reproduces the elliptical load it was given', () => {
    const result = solveElliptical(10, 5)

    for (const station of result.stations) {
      if (Math.abs(station.eta) > 0.97) continue
      expect(station.load).toBeCloseTo(station.elliptical, 1)
    }
  })

  it('converges as the lattice is refined', () => {
    const coarse = solveElliptical(10, 5, 60)
    const fine = solveElliptical(10, 5, 240)

    expect(coarse.clAlpha).toBeCloseTo(fine.clAlpha, 1)
    expect(coarse.spanEfficiency).toBeCloseTo(fine.spanEfficiency, 1)
  })
})

describe('lifting surface against lifting line', () => {
  it('reads below lifting-line theory, and closes the gap as span grows', () => {
    // This is the expected direction. Lifting-line theory ignores the wing's
    // chordwise extent and overpredicts the lift slope; a lifting-surface
    // method does not, and the two converge as the wing gets more slender.
    const ratios = [6, 12, 24].map((span) => {
      const w = wing({ span, rootChord: 1, taper: 1 })
      return solveWingVlm(w, 5).clAlpha / atAlpha(factorWing(w), 5).clAlpha
    })

    for (const ratio of ratios) {
      expect(ratio).toBeLessThan(1)
    }
    expect(ratios[1]).toBeGreaterThan(ratios[0])
    expect(ratios[2]).toBeGreaterThan(ratios[1])
  })

  it('stays sane at low aspect ratio, where lifting line does not', () => {
    // A square wing is well outside lifting-line theory's assumptions: it
    // overpredicts by nearly 40%. This is the case that justifies the lattice.
    const square = wing({ span: 1, rootChord: 1, taper: 1 })

    const vlm = solveWingVlm(square, 5, 200).clAlpha
    const llt = atAlpha(factorWing(square), 5).clAlpha
    const surface = helmbold(1)

    expect(Math.abs(vlm - surface) / surface).toBeLessThan(0.1)
    expect(llt / surface).toBeGreaterThan(1.3)
  })
})

describe('sweep, which lifting line cannot see at all', () => {
  it('loses lift as the wing is swept back', () => {
    const straight = solveWingVlm(wing({ sweepQuarter: 0 }), 5).clAlpha
    const swept30 = solveWingVlm(wing({ sweepQuarter: 30 }), 5).clAlpha
    const swept45 = solveWingVlm(wing({ sweepQuarter: 45 }), 5).clAlpha

    expect(swept30).toBeLessThan(straight)
    expect(swept45).toBeLessThan(swept30)
  })

  it('falls off roughly with the cosine of the sweep angle', () => {
    const straight = solveWingVlm(wing({ sweepQuarter: 0 }), 5).clAlpha
    const swept = solveWingVlm(wing({ sweepQuarter: 40 }), 5).clAlpha
    const cosine = Math.cos(40 * (Math.PI / 180))

    expect(swept / straight).toBeGreaterThan(cosine * 0.9)
    expect(swept / straight).toBeLessThan(1)
  })

  it('treats forward and aft sweep nearly alike, as the exact theory demands', () => {
    // Munk's reverse-flow theorem says a planform and its fore-aft mirror make
    // the same lift, so plus and minus 25 degrees of sweep should agree
    // exactly. A single chordwise row cannot honour that: reflecting the
    // planform maps the quarter chord onto the three-quarter chord, so the
    // vortex and the control point swap places. The residual asymmetry is the
    // size of that discretisation error, and it stays small.
    const aft = solveWingVlm(wing({ sweepQuarter: 25 }), 5).clAlpha
    const forward = solveWingVlm(wing({ sweepQuarter: -25 }), 5).clAlpha

    expect(Math.abs(forward - aft) / aft).toBeLessThan(0.05)
  })

  it('leaves lifting-line theory completely unmoved, which is the point', () => {
    const straight = atAlpha(factorWing(wing({ sweepQuarter: 0 })), 5).clAlpha
    const swept = atAlpha(factorWing(wing({ sweepQuarter: 45 })), 5).clAlpha

    expect(swept).toBeCloseTo(straight, 12)
  })
})

describe('dihedral', () => {
  it('costs lift, because less of the surface faces upward', () => {
    const flat = solveWingVlm(wing({ dihedral: 0 }), 5).cl
    const veed = solveWingVlm(wing({ dihedral: 20 }), 5).cl

    expect(veed).toBeLessThan(flat)
  })

  it('is invisible to lifting-line theory', () => {
    const flat = atAlpha(factorWing(wing({ dihedral: 0 })), 5).cl
    const veed = atAlpha(factorWing(wing({ dihedral: 20 })), 5).cl

    expect(veed).toBeCloseTo(flat, 12)
  })
})

describe('linearity and symmetry', () => {
  it('is affine in angle of attack', () => {
    const solution = factorWingVlm(wing({ twist: -3, naca: '2412' }))
    const a0 = vlmAtAlpha(solution, 0).cl
    const a5 = vlmAtAlpha(solution, 5).cl
    const a10 = vlmAtAlpha(solution, 10).cl

    expect(a10 - a5).toBeCloseTo(a5 - a0, 10)
  })

  it('makes no lift at zero incidence with a symmetric untwisted wing', () => {
    expect(solveWingVlm(wing(), 0).cl).toBeCloseTo(0, 10)
  })

  it('reports a zero-lift angle where the lift really is zero', () => {
    const solution = factorWingVlm(wing({ twist: -2, naca: '2412' }))
    const guess = vlmAtAlpha(solution, 0).zeroLiftAlpha

    expect(vlmAtAlpha(solution, guess).cl).toBeCloseTo(0, 10)
  })

  it('loads both half-wings identically', () => {
    const result = solveWingVlm(wing({ twist: -4, dihedral: 6 }), 5)
    const n = result.stations.length

    for (let i = 0; i < n; i++) {
      expect(result.stations[i].load).toBeCloseTo(result.stations[n - 1 - i].load, 6)
    }
  })

  it('reuses one factorisation without drift', () => {
    const solution = factorWingVlm(wing())
    const first = vlmAtAlpha(solution, 5).cl
    vlmAtAlpha(solution, -2)
    vlmAtAlpha(solution, 12)

    expect(vlmAtAlpha(solution, 5).cl).toBe(first)
  })
})

describe('consistency', () => {
  it('keeps induced drag tied to the span efficiency it reports', () => {
    const r = solveWingVlm(wing({ taper: 0.45 }), 5)
    expect(r.cdi).toBeCloseTo(
      (r.cl * r.cl) / (Math.PI * r.aspectRatio * r.spanEfficiency),
      10,
    )
  })

  it('never claims a planar wing beats the elliptical ideal', () => {
    for (const taper of [0.2, 0.45, 0.7, 1]) {
      const r = solveWingVlm(wing({ taper }), 5, 200)
      expect(r.spanEfficiency).toBeLessThan(1.02)
    }
  })

  it('produces no induced drag when it produces no lift', () => {
    const r = solveWingVlm(wing(), 0)
    expect(r.cdi).toBeCloseTo(0, 10)
  })
})
