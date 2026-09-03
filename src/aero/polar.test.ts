import { describe, expect, it } from 'vitest'
import { evaluate } from './evaluate'
import { factorWing } from './llt'
import { DEFAULT_PARAMS, type AircraftParams } from './params'
import { dragPolar, dragPolarWith } from './polar'

const design = (over: Partial<AircraftParams> = {}): AircraftParams => ({
  wing: { ...DEFAULT_PARAMS.wing, ...over.wing },
  operating: { ...DEFAULT_PARAMS.operating, ...over.operating },
})

describe('dragPolar', () => {
  it('sweeps the full angle-of-attack range', () => {
    const polar = dragPolar(design(), { step: 0.5 })

    expect(polar.points[0].alpha).toBeCloseTo(-6, 6)
    expect(polar.points.at(-1)!.alpha).toBeCloseTo(16, 6)
    expect(polar.points.length).toBe(45)
  })

  it('holds profile drag constant along the sweep', () => {
    // C_D0 depends on Reynolds number and shape, neither of which changes with
    // incidence. Only the induced part moves.
    const polar = dragPolar(design())

    for (const point of polar.points) {
      expect(point.cd0).toBeCloseTo(polar.cd0, 12)
      expect(point.cd).toBeCloseTo(point.cd0 + point.cdi, 12)
    }
  })

  it('puts induced drag at its floor near zero lift', () => {
    const polar = dragPolar(design())
    const nearZeroLift = polar.points.reduce((a, b) =>
      Math.abs(b.cl) < Math.abs(a.cl) ? b : a,
    )

    expect(nearZeroLift.cdi).toBeLessThan(1e-3)
    expect(nearZeroLift.cd).toBeCloseTo(polar.minimumDrag.cd, 4)
  })

  it('finds best lift-to-drag where induced drag has grown to meet profile drag', () => {
    // The classic result for a parabolic polar: L/D peaks when C_Di equals
    // C_D0. Our span efficiency drifts a little with incidence so the two are
    // not exactly equal, but they have to be close.
    const best = dragPolar(design(), { step: 0.1 }).bestLiftToDrag

    expect(best.cdi / best.cd0).toBeGreaterThan(0.8)
    expect(best.cdi / best.cd0).toBeLessThan(1.25)
  })

  it('agrees with an independent scan for the best point', () => {
    const polar = dragPolar(design())
    const scanned = polar.points
      .filter((p) => !p.beyondLinear)
      .reduce((a, b) => (b.liftToDrag > a.liftToDrag ? b : a))

    expect(polar.bestLiftToDrag.alpha).toBe(scanned.alpha)
    expect(polar.bestLiftToDrag.liftToDrag).toBe(scanned.liftToDrag)
  })

  it('never recommends a point the theory cannot stand behind', () => {
    // A thick, high-camber section reaches the linear limit inside the slider
    // range, so the recommendation has to stay below it.
    const polar = dragPolar(design({ wing: { ...DEFAULT_PARAMS.wing, naca: '4418' } }))

    expect(polar.bestLiftToDrag.beyondLinear).toBe(false)
    expect(polar.minimumDrag.beyondLinear).toBe(false)
  })

  it('flags the angles where linear theory gives out', () => {
    const polar = dragPolar(design({ wing: { ...DEFAULT_PARAMS.wing, naca: '4415' } }))
    const flagged = polar.points.filter((p) => p.beyondLinear)

    for (const point of flagged) {
      expect(point.maxSectionCl).toBeGreaterThan(polar.sectionClMax)
    }

    if (polar.linearLimitAlpha !== null) {
      // Everything below the limit must be clean, everything above it flagged.
      for (const point of polar.points) {
        if (point.alpha < polar.linearLimitAlpha) {
          expect(point.beyondLinear).toBe(false)
        }
      }
    }
  })

  it('places the current point where evaluate puts it', () => {
    const params = design({ operating: { ...DEFAULT_PARAMS.operating, alpha: 6.5 } })
    const polar = dragPolar(params)
    const results = evaluate(params)

    expect(polar.current.alpha).toBe(6.5)
    expect(polar.current.cl).toBeCloseTo(results.cl, 12)
    expect(polar.current.cd).toBeCloseTo(results.cd, 12)
    expect(polar.current.liftToDrag).toBeCloseTo(results.liftToDrag, 12)
  })

  it('gives the same answer whether or not the factorisation is shared', () => {
    const params = design()
    const shared = dragPolarWith(factorWing(params.wing), params)
    const fresh = dragPolar(params)

    expect(shared.points.map((p) => p.cd)).toEqual(fresh.points.map((p) => p.cd))
    expect(shared.bestLiftToDrag).toEqual(fresh.bestLiftToDrag)
  })

  it('sweeps far more cheaply than solving each angle from scratch', () => {
    // A relative budget rather than an absolute one, so it means the same thing
    // on a fast laptop and a loaded CI box. If someone reverts the shared
    // factorisation or the cached sine table, this ratio collapses and the
    // whole polar stops fitting comfortably inside a frame.
    const params = design()
    const solution = factorWing(params.wing)
    const runs = 40

    for (let i = 0; i < 10; i++) dragPolarWith(solution, params)
    const sharedStart = performance.now()
    for (let i = 0; i < runs; i++) dragPolarWith(solution, params)
    const shared = performance.now() - sharedStart

    for (let i = 0; i < 5; i++) dragPolar(params)
    const freshStart = performance.now()
    for (let i = 0; i < runs; i++) dragPolar(params)
    const fresh = performance.now() - freshStart

    // Re-factoring per sweep must cost meaningfully more than reusing one.
    expect(fresh).toBeGreaterThan(shared)
    // And a single sweep has to stay a small slice of a 16.7ms frame.
    expect(fresh / runs).toBeLessThan(5)
  })

  it('rewards a longer wing with a better peak lift-to-drag', () => {
    const stubby = dragPolar(
      design({ wing: { ...DEFAULT_PARAMS.wing, span: 8, rootChord: 1.75 } }),
    )
    const slender = dragPolar(
      design({ wing: { ...DEFAULT_PARAMS.wing, span: 16, rootChord: 0.875 } }),
    )

    expect(slender.bestLiftToDrag.liftToDrag).toBeGreaterThan(
      stubby.bestLiftToDrag.liftToDrag,
    )
  })
})
