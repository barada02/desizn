import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type AircraftParams } from '../aero/params'
import { METRICS, compare, scoreComparison } from './compare'
import { analyse } from './snapshot'

const design = (over: Partial<AircraftParams['wing']> = {}) =>
  analyse({ ...DEFAULT_PARAMS, wing: { ...DEFAULT_PARAMS.wing, ...over } })

const find = (deltas: ReturnType<typeof compare>, id: string) =>
  deltas.find((d) => d.metric.id === id)!

describe('compare', () => {
  it('reports nothing changed when nothing changed', () => {
    const deltas = compare(design(), design())

    expect(deltas.every((d) => d.unchanged)).toBe(true)
    expect(deltas.every((d) => d.improved === null)).toBe(true)
    expect(scoreComparison(deltas)).toEqual({
      better: 0,
      worse: 0,
      moved: 0,
      unchanged: METRICS.length,
    })
  })

  it('knows a longer wing at constant area improved the induced drag', () => {
    const deltas = compare(
      design({ span: 8, rootChord: 1.75 }),
      design({ span: 16, rootChord: 0.875 }),
    )

    const induced = find(deltas, 'cdi')
    expect(induced.change).toBeLessThan(0)
    expect(induced.improved).toBe(true)

    const bestLd = find(deltas, 'best-ld')
    expect(bestLd.improved).toBe(true)
  })

  it('knows a shorter wing made things worse', () => {
    const deltas = compare(
      design({ span: 16, rootChord: 0.875 }),
      design({ span: 8, rootChord: 1.75 }),
    )

    expect(find(deltas, 'cdi').improved).toBe(false)
    expect(find(deltas, 'best-ld').improved).toBe(false)
  })

  it('calls a lower stall speed an improvement', () => {
    const deltas = compare(design({ rootChord: 1 }), design({ rootChord: 2 }))
    const stall = find(deltas, 'stall')

    expect(stall.change).toBeLessThan(0)
    expect(stall.improved).toBe(true)
  })

  it('refuses to rank a metric that has no better direction', () => {
    // Span is a choice, not a score. Colouring it green would be a lie.
    const deltas = compare(design({ span: 9 }), design({ span: 13 }))
    const span = find(deltas, 'span')

    expect(span.change).toBeCloseTo(4, 6)
    expect(span.metric.better).toBe(null)
    expect(span.improved).toBe(null)
    expect(span.unchanged).toBe(false)
  })

  it('treats a difference too small to display as no difference', () => {
    // Aspect ratio shows two decimals, so a change in the fifth is not a result.
    const deltas = compare(design({ span: 10 }), design({ span: 10.0001 }))

    expect(find(deltas, 'aspect-ratio').unchanged).toBe(true)
    expect(find(deltas, 'aspect-ratio').improved).toBe(null)
  })

  it('expresses the change as a fraction of where it started', () => {
    const deltas = compare(design({ span: 10 }), design({ span: 15 }))
    const span = find(deltas, 'span')

    expect(span.fraction).toBeCloseTo(0.5, 6)
  })

  it('counts the wins and the losses of a real trade', () => {
    // Stretching the span at constant area buys glide, and moves the span and
    // aspect ratio without either being an improvement.
    const score = scoreComparison(
      compare(design({ span: 9, rootChord: 1.55 }), design({ span: 15, rootChord: 0.93 })),
    )

    expect(score.better).toBeGreaterThan(0)
    expect(score.moved).toBeGreaterThan(0)
    // The four counts have to account for every metric, once each.
    expect(score.better + score.worse + score.moved + score.unchanged).toBe(
      METRICS.length,
    )
  })
})

describe('the metric list', () => {
  it('has no duplicate ids', () => {
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length)
  })

  it('reads a finite number out of a real design for every metric', () => {
    const snapshot = design()
    for (const metric of METRICS) {
      expect(Number.isFinite(metric.read(snapshot))).toBe(true)
    }
  })
})
