import { describe, expect, it } from 'vitest'
import { atmosphere, dynamicPressure, reynolds } from './atmosphere'

describe('ISA atmosphere', () => {
  it('matches the standard sea-level condition', () => {
    const a = atmosphere(0)

    expect(a.temperature).toBeCloseTo(288.15, 6)
    expect(a.pressure).toBeCloseTo(101325, 6)
    expect(a.density).toBeCloseTo(1.225, 3)
    expect(a.soundSpeed).toBeCloseTo(340.29, 1)
  })

  it('matches the published tropopause condition at 11 km', () => {
    const a = atmosphere(11000)

    expect(a.temperature).toBeCloseTo(216.65, 2)
    expect(a.pressure).toBeCloseTo(22632, 0)
    expect(a.density).toBeCloseTo(0.3639, 4)
  })

  it('joins its two layers without a step at the tropopause', () => {
    // Straddle the boundary tightly enough that any real discontinuity in the
    // formulas would dwarf the hydrostatic change across the gap itself.
    const below = atmosphere(11000 - 1e-3)
    const above = atmosphere(11000 + 1e-3)

    expect(above.pressure).toBeCloseTo(below.pressure, 1)
    expect(above.density).toBeCloseTo(below.density, 6)
  })

  it('thins out monotonically with height', () => {
    let previous = atmosphere(0).density

    for (let h = 500; h <= 20000; h += 500) {
      const density = atmosphere(h).density
      expect(density).toBeLessThan(previous)
      previous = density
    }
  })

  it('holds temperature constant through the lower stratosphere', () => {
    expect(atmosphere(15000).temperature).toBeCloseTo(216.65, 2)
    expect(atmosphere(20000).temperature).toBeCloseTo(216.65, 2)
  })

  it('clamps below sea level rather than extrapolating', () => {
    expect(atmosphere(-500).pressure).toBeCloseTo(atmosphere(0).pressure, 6)
  })
})

describe('derived flow quantities', () => {
  it('computes dynamic pressure', () => {
    expect(dynamicPressure(1.225, 45)).toBeCloseTo(0.5 * 1.225 * 45 * 45, 9)
  })

  it('puts a light aircraft chord in the expected Reynolds range', () => {
    // 1.4 m chord at 45 m/s sea level lands in the low millions, which is where
    // the flat-plate skin-friction correlation is meant to be used.
    const re = reynolds(atmosphere(0), 45, 1.4)

    expect(re).toBeGreaterThan(3e6)
    expect(re).toBeLessThan(5e6)
  })
})
