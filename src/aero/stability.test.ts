import { describe, expect, it } from 'vitest'
import { factorSurface } from './solver'
import { DEFAULT_PARAMS, type TailParams, type WingParams } from './params'
import { planform } from './planform'
import {
  COMFORTABLE_MARGIN,
  WING_AERODYNAMIC_CENTRE,
  downwashGradient,
  stability,
  tailAsWing,
} from './stability'

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  ...over,
})

const tail = (over: Partial<TailParams> = {}): TailParams => ({
  ...DEFAULT_PARAMS.tail,
  ...over,
})

/** The wing's own lift-curve slope, as the caller would supply it. */
const slopeOf = (w: WingParams) => factorSurface(w, DEFAULT_PARAMS.solver).at(0).clAlpha

const analyse = (w: WingParams, t: TailParams, cg: number) =>
  stability(w, t, { cg }, slopeOf(w), DEFAULT_PARAMS.solver)

describe('downwashGradient', () => {
  it('lands in the range a real tail sees', () => {
    // Typical light-aircraft wings put roughly a third of an incidence change
    // into downwash at the tail.
    const w = wing()
    const value = downwashGradient(slopeOf(w), planform(w).aspectRatio)

    expect(value).toBeGreaterThan(0.2)
    expect(value).toBeLessThan(0.5)
  })

  it('falls as the wing gets more slender', () => {
    const stubby = wing({ span: 7, rootChord: 1.8 })
    const slender = wing({ span: 18, rootChord: 0.7 })

    expect(
      downwashGradient(slopeOf(slender), planform(slender).aspectRatio),
    ).toBeLessThan(downwashGradient(slopeOf(stubby), planform(stubby).aspectRatio))
  })
})

describe('neutral point', () => {
  it('collapses onto the wing aerodynamic centre without a tail', () => {
    // A vanishing tail contributes no restoring moment, so the neutral point
    // is the wing's own aerodynamic centre and nothing else.
    const result = analyse(wing(), tail({ span: 1, rootChord: 0.2, arm: 1 }), 0.25)

    expect(result.neutralPoint).toBeGreaterThan(WING_AERODYNAMIC_CENTRE)
    expect(result.neutralPoint).toBeLessThan(WING_AERODYNAMIC_CENTRE + 0.1)
  })

  it('moves aft as the tail grows', () => {
    const small = analyse(wing(), tail({ span: 2 }), 0.4).neutralPoint
    const large = analyse(wing(), tail({ span: 4.5 }), 0.4).neutralPoint

    expect(large).toBeGreaterThan(small)
  })

  it('moves aft as the tail arm lengthens', () => {
    const near = analyse(wing(), tail({ arm: 2.5 }), 0.4).neutralPoint
    const far = analyse(wing(), tail({ arm: 6.5 }), 0.4).neutralPoint

    expect(far).toBeGreaterThan(near)
  })

  it('does not depend on where the mass happens to sit', () => {
    const forward = analyse(wing(), tail(), 0.2).neutralPoint
    const aft = analyse(wing(), tail(), 0.6).neutralPoint

    expect(forward).toBeCloseTo(aft, 12)
  })

  it('buys more stability from span than from chord at equal area', () => {
    // A longer, narrower tailplane has the higher aspect ratio, so a steeper
    // lift curve, so more authority for the same area.
    const slender = analyse(wing(), tail({ span: 4, rootChord: 0.525 }), 0.4)
    const stubby = analyse(wing(), tail({ span: 2.8, rootChord: 0.75 }), 0.4)

    expect(slender.tailArea).toBeCloseTo(stubby.tailArea, 2)
    expect(slender.tailAspectRatio).toBeGreaterThan(stubby.tailAspectRatio)
    expect(slender.neutralPoint).toBeGreaterThan(stubby.neutralPoint)
  })
})

describe('static margin', () => {
  it('is exactly the gap between the neutral point and the CG', () => {
    const result = analyse(wing(), tail(), 0.38)
    expect(result.staticMargin).toBeCloseTo(result.neutralPoint - 0.38, 12)
  })

  it('shrinks as the CG moves aft', () => {
    const forward = analyse(wing(), tail(), 0.3).staticMargin
    const aft = analyse(wing(), tail(), 0.5).staticMargin

    expect(aft).toBeLessThan(forward)
    expect(forward - aft).toBeCloseTo(0.2, 12)
  })

  it('goes unstable once the CG passes the neutral point', () => {
    const neutralPoint = analyse(wing(), tail(), 0.4).neutralPoint
    const behind = analyse(wing(), tail(), neutralPoint + 0.05)

    expect(behind.staticMargin).toBeLessThan(0)
    expect(behind.verdict).toBe('unstable')
  })

  it('grades the margin the way a pilot would', () => {
    const neutralPoint = analyse(wing(), tail(), 0.4).neutralPoint
    const at = (margin: number) => analyse(wing(), tail(), neutralPoint - margin).verdict

    expect(at(-0.02)).toBe('unstable')
    expect(at(0.02)).toBe('marginal')
    expect(at(0.12)).toBe('stable')
    expect(at(0.35)).toBe('very-stable')
  })

  it('puts the aft limit at the neutral point itself', () => {
    const result = analyse(wing(), tail(), 0.4)
    expect(result.aftLimit).toBeCloseTo(result.neutralPoint, 12)
  })
})

describe('tail volume', () => {
  it('matches the definition it is named after', () => {
    const w = wing()
    const t = tail()
    const result = analyse(w, t, 0.4)
    const wingGeometry = planform(w)
    const tailGeometry = planform(tailAsWing(t))

    expect(result.tailVolume).toBeCloseTo(
      (tailGeometry.area * t.arm) / (wingGeometry.area * wingGeometry.mac),
      12,
    )
  })

  it('sits in the ordinary light-aircraft range for the shipped design', () => {
    // Light aircraft typically run a horizontal tail volume of 0.5 to 0.9.
    const result = analyse(DEFAULT_PARAMS.wing, DEFAULT_PARAMS.tail, 0.45)

    expect(result.tailVolume).toBeGreaterThan(0.5)
    expect(result.tailVolume).toBeLessThan(0.9)
  })
})

describe('the shipped design', () => {
  it('opens comfortably stable', () => {
    const result = stability(
      DEFAULT_PARAMS.wing,
      DEFAULT_PARAMS.tail,
      DEFAULT_PARAMS.balance,
      slopeOf(DEFAULT_PARAMS.wing),
      DEFAULT_PARAMS.solver,
    )

    expect(result.verdict).toBe('stable')
    expect(result.staticMargin).toBeGreaterThan(COMFORTABLE_MARGIN.min)
    expect(result.staticMargin).toBeLessThan(COMFORTABLE_MARGIN.max)
  })

  it('would still be flyable once a fuselage eats its allowance', () => {
    // The model has no fuselage, so the margin is optimistic. It should not be
    // so thin that the known gap alone would make it unstable.
    const result = stability(
      DEFAULT_PARAMS.wing,
      DEFAULT_PARAMS.tail,
      DEFAULT_PARAMS.balance,
      slopeOf(DEFAULT_PARAMS.wing),
      DEFAULT_PARAMS.solver,
    )

    expect(result.staticMargin - result.fuselageAllowance).toBeGreaterThan(0)
  })
})
