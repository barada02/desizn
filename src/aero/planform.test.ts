import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type WingParams } from './params'
import {
  chordAt,
  leadingEdgeX,
  planform,
  thicknessRatio,
  twistAt,
} from './planform'

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  ...over,
})

describe('planform', () => {
  it('reduces to the textbook values for a rectangular wing', () => {
    // b = 10, c = 1: area is a rectangle, MAC is the chord, and the MAC sits
    // at mid-semispan.
    const p = planform(wing({ span: 10, rootChord: 1, taper: 1, sweepQuarter: 0 }))

    expect(p.area).toBeCloseTo(10, 10)
    expect(p.aspectRatio).toBeCloseTo(10, 10)
    expect(p.mac).toBeCloseTo(1, 10)
    expect(p.yMac).toBeCloseTo(2.5, 10)
    expect(p.tipChord).toBeCloseTo(1, 10)
  })

  it('reduces to the textbook values for a triangular wing', () => {
    // A wing tapering to a point: half the area, two thirds the chord, and the
    // MAC a third of the way out.
    const p = planform(wing({ span: 12, rootChord: 2, taper: 0 }))

    expect(p.area).toBeCloseTo(12, 10)
    expect(p.mac).toBeCloseTo((2 / 3) * 2, 10)
    expect(p.yMac).toBeCloseTo(2, 10)
  })

  it('keeps aspect ratio consistent with span and area', () => {
    const w = wing({ span: 14.4, rootChord: 1.9, taper: 0.38 })
    const p = planform(w)

    expect(p.aspectRatio).toBeCloseTo((w.span * w.span) / p.area, 10)
  })

  it('derives a leading-edge sweep that matches the drawn leading edge', () => {
    // The closed-form conversion from quarter-chord to leading-edge sweep has
    // to agree with where leadingEdgeX actually puts the two ends of the line.
    const w = wing({ span: 10, rootChord: 1, taper: 0.5, sweepQuarter: 0 })
    const p = planform(w)

    const run = leadingEdgeX(w, p.halfSpan) - leadingEdgeX(w, 0)
    expect(Math.atan(run / p.halfSpan) * (180 / Math.PI)).toBeCloseTo(
      p.sweepLeadingEdge,
      10,
    )
  })

  it('leaves the leading edge unswept when an untapered wing is unswept', () => {
    const p = planform(wing({ taper: 1, sweepQuarter: 0 }))
    expect(p.sweepLeadingEdge).toBeCloseTo(0, 10)
  })
})

describe('spanwise distributions', () => {
  it('interpolates chord linearly from root to tip', () => {
    const w = wing({ span: 10, rootChord: 2, taper: 0.5 })

    expect(chordAt(w, 0)).toBeCloseTo(2, 10)
    expect(chordAt(w, 5)).toBeCloseTo(1, 10)
    expect(chordAt(w, 2.5)).toBeCloseTo(1.5, 10)
  })

  it('treats the two half-wings as mirror images', () => {
    const w = wing({ span: 10, rootChord: 2, taper: 0.4, twist: -3 })

    expect(chordAt(w, -3.1)).toBeCloseTo(chordAt(w, 3.1), 12)
    expect(twistAt(w, -3.1)).toBeCloseTo(twistAt(w, 3.1), 12)
  })

  it('washes out linearly, reaching the full twist at the tip', () => {
    const w = wing({ span: 8, twist: -4 })

    expect(twistAt(w, 0)).toBeCloseTo(0, 12)
    expect(twistAt(w, 4)).toBeCloseTo(-4, 12)
    expect(twistAt(w, 2)).toBeCloseTo(-2, 12)
  })
})

describe('thicknessRatio', () => {
  it('reads the last two digits of the NACA code', () => {
    expect(thicknessRatio('2412')).toBeCloseTo(0.12, 12)
    expect(thicknessRatio('0009')).toBeCloseTo(0.09, 12)
    expect(thicknessRatio('4421')).toBeCloseTo(0.21, 12)
  })
})
