import { describe, expect, it } from 'vitest'
import { atmosphere } from './atmosphere'
import { evaluate } from './evaluate'
import { formFactor, skinFrictionCoefficient } from './drag'
import { DEFAULT_PARAMS, type AircraftParams } from './params'

const design = (over: Partial<AircraftParams> = {}): AircraftParams => ({
  wing: { ...DEFAULT_PARAMS.wing, ...over.wing },
  operating: { ...DEFAULT_PARAMS.operating, ...over.operating },
})

describe('skin friction and form factor', () => {
  it('matches the Prandtl-Schlichting correlation at a round number', () => {
    expect(skinFrictionCoefficient(1e6)).toBeCloseTo(0.00447, 5)
  })

  it('falls as Reynolds number rises', () => {
    expect(skinFrictionCoefficient(1e7)).toBeLessThan(skinFrictionCoefficient(1e6))
    expect(skinFrictionCoefficient(1e6)).toBeLessThan(skinFrictionCoefficient(1e5))
  })

  it('charges a thick section more than a thin one', () => {
    expect(formFactor(0.12)).toBeCloseTo(1.2607, 4)
    expect(formFactor(0.21)).toBeGreaterThan(formFactor(0.09))
    expect(formFactor(0)).toBe(1)
  })
})

describe('evaluate', () => {
  it('adds the two drag sources and nothing else', () => {
    const r = evaluate(design())
    expect(r.cd).toBeCloseTo(r.drag.cd0 + r.drag.cdi, 12)
  })

  it('produces a sane light-aircraft design point', () => {
    const r = evaluate(design())

    expect(r.geometry.aspectRatio).toBeGreaterThan(6)
    expect(r.cl).toBeGreaterThan(0.2)
    expect(r.cl).toBeLessThan(1.2)
    expect(r.drag.cd0).toBeGreaterThan(0.004)
    expect(r.drag.cd0).toBeLessThan(0.02)
    expect(r.liftToDrag).toBeGreaterThan(8)
    expect(r.liftToDrag).toBeLessThan(40)
  })

  it('scales lift with dynamic pressure and area', () => {
    const r = evaluate(design())
    expect(r.lift).toBeCloseTo(r.dynamicPressure * r.geometry.area * r.cl, 6)
    expect(r.dragForce).toBeCloseTo(r.dynamicPressure * r.geometry.area * r.cd, 6)
  })

  it('reports the angle that actually trims for level flight', () => {
    // Ask for the level-flight angle, fly at it, and the wing should make
    // exactly the lift it needs.
    const base = design({ operating: { ...DEFAULT_PARAMS.operating, speed: 50 } })
    const trimmed = evaluate({
      ...base,
      operating: { ...base.operating, alpha: evaluate(base).alphaForLevelFlight },
    })

    expect(trimmed.cl).toBeCloseTo(trimmed.clRequired, 8)
    expect(trimmed.lift).toBeCloseTo(base.operating.mass * 9.80665, 6)
  })

  it('needs less lift coefficient as it flies faster', () => {
    const slow = evaluate(design({ operating: { ...DEFAULT_PARAMS.operating, speed: 30 } }))
    const fast = evaluate(design({ operating: { ...DEFAULT_PARAMS.operating, speed: 70 } }))

    expect(fast.clRequired).toBeLessThan(slow.clRequired)
  })

  it('needs more lift coefficient in thinner air', () => {
    const low = evaluate(design({ operating: { ...DEFAULT_PARAMS.operating, altitude: 0 } }))
    const high = evaluate(
      design({ operating: { ...DEFAULT_PARAMS.operating, altitude: 8000 } }),
    )

    expect(high.clRequired).toBeGreaterThan(low.clRequired)
    expect(high.air.density).toBeLessThan(low.air.density)
    expect(high.air.density).toBeCloseTo(atmosphere(8000).density, 12)
  })

  it('rewards a longer wing at the same area and weight', () => {
    const stubby = evaluate(
      design({ wing: { ...DEFAULT_PARAMS.wing, span: 8, rootChord: 1.75 } }),
    )
    const slender = evaluate(
      design({ wing: { ...DEFAULT_PARAMS.wing, span: 16, rootChord: 0.875 } }),
    )

    expect(slender.geometry.area).toBeCloseTo(stubby.geometry.area, 6)
    expect(slender.drag.cdi).toBeLessThan(stubby.drag.cdi)
  })

  it('knows when the wing is not holding the aircraft up', () => {
    const stalledOut = evaluate(
      design({
        operating: { ...DEFAULT_PARAMS.operating, speed: 15, mass: 4000, alpha: 0 },
      }),
    )
    const comfortable = evaluate(
      design({
        operating: { ...DEFAULT_PARAMS.operating, speed: 60, mass: 700, alpha: 5 },
      }),
    )

    expect(stalledOut.sustainsLevelFlight).toBe(false)
    expect(comfortable.sustainsLevelFlight).toBe(true)
  })

  it('hands the chart a full span of stations', () => {
    const r = evaluate(design())

    expect(r.stations.length).toBeGreaterThan(20)
    expect(r.stations[0].eta).toBeLessThan(-0.9)
    expect(r.stations.at(-1)!.eta).toBeGreaterThan(0.9)
    for (const s of r.stations) {
      expect(Number.isFinite(s.load)).toBe(true)
      expect(Number.isFinite(s.cl)).toBe(true)
    }
  })
})
