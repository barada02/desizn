import { describe, expect, it } from 'vitest'
import {
  airfoilCoordinates,
  camberLine,
  camberSlope,
  halfThicknessAt,
  parseNaca,
  zeroLiftAlpha,
} from './airfoil'

const DEG = 180 / Math.PI

describe('parseNaca', () => {
  it('reads camber, camber position and thickness out of the code', () => {
    expect(parseNaca('2412')).toMatchObject({
      camber: 0.02,
      camberPos: 0.4,
      thickness: 0.12,
    })
    expect(parseNaca('0009')).toMatchObject({
      camber: 0,
      camberPos: 0,
      thickness: 0.09,
    })
    expect(parseNaca('4415')).toMatchObject({
      camber: 0.04,
      camberPos: 0.4,
      thickness: 0.15,
    })
  })
})

describe('thickness distribution', () => {
  it('peaks at the right height, near 30% chord', () => {
    const s = parseNaca('0012')

    let peak = 0
    let peakX = 0
    for (let x = 0; x <= 1; x += 0.0005) {
      const yt = halfThicknessAt(x, s)
      if (yt > peak) {
        peak = yt
        peakX = x
      }
    }

    // y_t is the half-thickness, so the peak is t/2.
    expect(peak).toBeCloseTo(0.06, 3)
    expect(peakX).toBeGreaterThan(0.28)
    expect(peakX).toBeLessThan(0.32)
  })

  it('closes at the trailing edge and vanishes at the leading edge', () => {
    const s = parseNaca('2412')

    expect(halfThicknessAt(0, s)).toBeCloseTo(0, 12)
    expect(halfThicknessAt(1, s)).toBeCloseTo(0, 4)
  })
})

describe('camber line', () => {
  it('peaks at the stated camber and position', () => {
    const s = parseNaca('2412')

    expect(camberLine(0.4, s)).toBeCloseTo(0.02, 10)
    expect(camberSlope(0.4, s)).toBeCloseTo(0, 10)
  })

  it('starts and ends on the chord line', () => {
    const s = parseNaca('4412')

    expect(camberLine(0, s)).toBeCloseTo(0, 12)
    expect(camberLine(1, s)).toBeCloseTo(0, 12)
  })

  it('is flat everywhere for a symmetric section', () => {
    const s = parseNaca('0012')

    for (const x of [0, 0.1, 0.35, 0.7, 1]) {
      expect(camberLine(x, s)).toBe(0)
      expect(camberSlope(x, s)).toBe(0)
    }
  })

  it('joins its two branches without a step at the camber position', () => {
    const s = parseNaca('2412')

    expect(camberLine(0.4 + 1e-9, s)).toBeCloseTo(camberLine(0.4 - 1e-9, s), 12)
  })
})

describe('zeroLiftAlpha', () => {
  it('is exactly zero for a symmetric section', () => {
    expect(zeroLiftAlpha(parseNaca('0012'))).toBe(0)
    expect(zeroLiftAlpha(parseNaca('0006'))).toBe(0)
  })

  it('matches the published thin-airfoil result for NACA 2412', () => {
    expect(zeroLiftAlpha(parseNaca('2412')) * DEG).toBeCloseTo(-2.07, 1)
  })

  it('scales linearly with camber at a fixed camber position', () => {
    // alpha_L0 depends on the camber line only through the factor m, so
    // doubling the first digit has to double the angle exactly.
    const a2 = zeroLiftAlpha(parseNaca('2412'))
    const a4 = zeroLiftAlpha(parseNaca('4412'))

    expect(a4).toBeCloseTo(2 * a2, 12)
  })

  it('does not depend on thickness', () => {
    expect(zeroLiftAlpha(parseNaca('2415'))).toBeCloseTo(
      zeroLiftAlpha(parseNaca('2409')),
      12,
    )
  })

  it('has converged by the default number of intervals', () => {
    const coarse = zeroLiftAlpha(parseNaca('2412'), 400)
    const fine = zeroLiftAlpha(parseNaca('2412'), 4000)

    expect(coarse).toBeCloseTo(fine, 6)
  })
})

describe('airfoilCoordinates', () => {
  it('returns a closed contour with no repeated seam point', () => {
    const contour = airfoilCoordinates(parseNaca('2412'), 40)

    expect(contour).toHaveLength(2 * 40 - 2)
    // Index 0 is the trailing edge; the last point must not repeat it.
    expect(contour[0].x).toBeCloseTo(1, 6)
    expect(contour.at(-1)!.x).toBeLessThan(1)
  })

  it('runs from the trailing edge over the top to the leading edge', () => {
    const stations = 40
    const contour = airfoilCoordinates(parseNaca('2412'), stations)

    expect(contour[stations - 1].x).toBeCloseTo(0, 6)
    expect(contour[stations - 1].z).toBeCloseTo(0, 6)
    // A quarter of the way along the upper run, we are above the chord line.
    expect(contour[Math.round(stations * 0.75)].z).toBeGreaterThan(0)
  })

  it('keeps the upper surface above the lower one', () => {
    const stations = 50
    const contour = airfoilCoordinates(parseNaca('2412'), stations)

    // Points i and (2*stations - 2 - i) are the upper and lower surface at
    // roughly the same chordwise station.
    for (let i = 1; i < stations - 2; i++) {
      const upper = contour[i]
      const lower = contour[2 * stations - 2 - i]
      expect(upper.z).toBeGreaterThan(lower.z)
    }
  })

  it('stays within a rounded nose of the unit chord', () => {
    // Surface points are offset perpendicular to the camber line, so on a
    // cambered section the rounded nose wraps a fraction of a percent ahead of
    // x = 0. That is the real shape, not drift - but anything beyond a percent
    // of chord would mean the offset has gone wrong.
    for (const code of ['0006', '2412', '4421']) {
      for (const p of airfoilCoordinates(parseNaca(code), 60)) {
        expect(p.x).toBeGreaterThan(-0.01)
        expect(p.x).toBeLessThanOrEqual(1 + 1e-9)
        expect(Math.abs(p.z)).toBeLessThan(0.25)
      }
    }
  })
})
