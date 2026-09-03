import { describe, expect, it } from 'vitest'
import { sectionProperties } from './airfoil'
import { atmosphere } from './atmosphere'
import {
  LIMIT_LOAD_POSITIVE,
  flightEnvelope,
  wingStall,
} from './envelope'
import { atAlpha, factorWing } from './llt'
import { DEFAULT_PARAMS, type AircraftParams, type WingParams } from './params'
import { planform } from './planform'

const design = (over: Partial<AircraftParams> = {}): AircraftParams => ({
  ...DEFAULT_PARAMS,
  ...over,
  wing: { ...DEFAULT_PARAMS.wing, ...over.wing },
  operating: { ...DEFAULT_PARAMS.operating, ...over.operating },
})

const envelopeOf = (params: AircraftParams) =>
  flightEnvelope(
    factorWing(params.wing),
    params,
    sectionProperties(params.wing.naca).clMax,
  )

const stallOf = (w: WingParams) =>
  wingStall(factorWing(w), sectionProperties(w.naca).clMax)

describe('wingStall', () => {
  it('puts the first section exactly at its own limit', () => {
    // The defining property: at the reported stall angle the critical station
    // is sitting on the section clMax, and nothing has passed it.
    const w = DEFAULT_PARAMS.wing
    const limit = sectionProperties(w.naca).clMax
    const stall = stallOf(w)
    const atStall = atAlpha(factorWing(w), stall.alphaStall)

    const peak = Math.max(...atStall.stations.map((s) => s.cl))
    expect(peak).toBeCloseTo(limit, 6)
  })

  it('reports a wing clMax below the section it is built from', () => {
    // Only one station reaches the section limit; the rest are working less
    // hard, so the wing as a whole always stalls below its aerofoil.
    const w = DEFAULT_PARAMS.wing
    const stall = stallOf(w)

    expect(stall.clMax).toBeGreaterThan(0.9)
    expect(stall.clMax).toBeLessThan(sectionProperties(w.naca).clMax)
  })

  it('moves the stall inboard when washout is applied', () => {
    // This is the entire point of washout, so it is worth a test.
    const noTwist = stallOf({ ...DEFAULT_PARAMS.wing, twist: 0, taper: 0.3 })
    const washedOut = stallOf({ ...DEFAULT_PARAMS.wing, twist: -6, taper: 0.3 })

    expect(Math.abs(washedOut.criticalEta)).toBeLessThan(
      Math.abs(noTwist.criticalEta),
    )
  })

  it('warns when a sharply tapered wing stalls out near the ailerons', () => {
    const tippy = stallOf({ ...DEFAULT_PARAMS.wing, taper: 0.2, twist: 0 })
    expect(tippy.stallsAtTip).toBe(true)
  })

  it('gives a cambered section a higher stall than a symmetric one', () => {
    const symmetric = stallOf({ ...DEFAULT_PARAMS.wing, naca: '0012' })
    const cambered = stallOf({ ...DEFAULT_PARAMS.wing, naca: '4412' })

    expect(cambered.clMax).toBeGreaterThan(symmetric.clMax)
  })
})

describe('flightEnvelope', () => {
  it('computes a stall speed that satisfies its own definition', () => {
    // At the stall speed, the lift at clMax has to equal the weight exactly.
    const params = design()
    const envelope = envelopeOf(params)
    const geometry = planform(params.wing)
    const air = atmosphere(params.operating.altitude)

    const lift =
      0.5 *
      air.density *
      envelope.stallSpeed ** 2 *
      geometry.area *
      envelope.clMax

    expect(lift).toBeCloseTo(params.operating.mass * 9.80665, 4)
  })

  it('lands in a believable range for a light aircraft', () => {
    const envelope = envelopeOf(design())

    expect(envelope.stallSpeed).toBeGreaterThan(15)
    expect(envelope.stallSpeed).toBeLessThan(45)
  })

  it('puts manoeuvre speed at the stall speed times root n', () => {
    const envelope = envelopeOf(design())

    expect(envelope.manoeuvreSpeed).toBeCloseTo(
      envelope.stallSpeed * Math.sqrt(LIMIT_LOAD_POSITIVE),
      9,
    )
  })

  it('raises the stall speed with weight and with altitude', () => {
    const light = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, mass: 600 } }))
    const heavy = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, mass: 1400 } }))
    const high = envelopeOf(
      design({ operating: { ...DEFAULT_PARAMS.operating, altitude: 6000 } }),
    )
    const low = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, altitude: 0 } }))

    expect(heavy.stallSpeed).toBeGreaterThan(light.stallSpeed)
    expect(high.stallSpeed).toBeGreaterThan(low.stallSpeed)
  })

  it('follows the square root of weight, as the definition demands', () => {
    const base = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, mass: 800 } }))
    const doubled = envelopeOf(
      design({ operating: { ...DEFAULT_PARAMS.operating, mass: 1600 } }),
    )

    expect(doubled.stallSpeed / base.stallSpeed).toBeCloseTo(Math.SQRT2, 6)
  })

  it('describes the design, not the throttle setting', () => {
    // Dive speed and the whole envelope belong to the aircraft. Flying faster
    // must not redraw the limits you are being judged against.
    const slow = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, speed: 25 } }))
    const fast = envelopeOf(design({ operating: { ...DEFAULT_PARAMS.operating, speed: 95 } }))

    expect(fast.diveSpeed).toBeCloseTo(slow.diveSpeed, 9)
    expect(fast.manoeuvreSpeed).toBeCloseTo(slow.manoeuvreSpeed, 9)
    expect(slow.diveSpeed).toBeGreaterThan(slow.manoeuvreSpeed)
  })

  it('puts the dive speed where a light aircraft would have it', () => {
    const envelope = envelopeOf(design())
    const ratio = envelope.diveSpeed / envelope.stallSpeed

    expect(ratio).toBeGreaterThan(3)
    expect(ratio).toBeLessThan(4.5)
  })

  it('can be overspeeded, which is the point of drawing a limit', () => {
    const envelope = envelopeOf(
      design({ operating: { ...DEFAULT_PARAMS.operating, speed: 120, alpha: 0 } }),
    )

    expect(envelope.currentSpeed).toBeGreaterThan(envelope.diveSpeed)
    expect(envelope.outsideEnvelope).toBe(true)
  })

  it('draws boundaries that start at the origin and reach the dive speed', () => {
    const envelope = envelopeOf(design())

    expect(envelope.positiveBoundary[0]).toEqual({ v: 0, n: 0 })
    expect(envelope.positiveBoundary.at(-1)!.v).toBeCloseTo(envelope.diveSpeed, 9)
    expect(envelope.negativeBoundary.at(-1)!.v).toBeCloseTo(envelope.diveSpeed, 9)

    for (const point of envelope.positiveBoundary) {
      expect(point.n).toBeLessThanOrEqual(LIMIT_LOAD_POSITIVE + 1e-9)
    }
  })

  it('passes through the limit load exactly at the manoeuvre speed', () => {
    const envelope = envelopeOf(design())
    const atCorner = envelope.positiveBoundary.at(-3)!

    expect(atCorner.v).toBeCloseTo(envelope.manoeuvreSpeed, 6)
    expect(atCorner.n).toBeCloseTo(LIMIT_LOAD_POSITIVE, 6)
  })

  it('reads about one g in steady level flight', () => {
    const params = design()
    const trimmed = design({
      operating: {
        ...params.operating,
        alpha: DEFAULT_PARAMS.operating.alpha,
      },
    })
    const envelope = envelopeOf(trimmed)

    expect(envelope.currentLoadFactor).toBeGreaterThan(0.9)
    expect(envelope.currentLoadFactor).toBeLessThan(1.15)
    expect(envelope.outsideEnvelope).toBe(false)
  })

  it('notices an angle of attack past the stall', () => {
    // The stall boundary and the load factor both scale with V squared, so
    // this comparison is really "is alpha past alphaStall" - speed cancels.
    const params = design()
    const stall = stallOf(params.wing)

    const past = envelopeOf(
      design({
        operating: { ...DEFAULT_PARAMS.operating, alpha: stall.alphaStall + 0.5 },
      }),
    )
    const below = envelopeOf(
      design({
        operating: { ...DEFAULT_PARAMS.operating, alpha: stall.alphaStall - 2 },
      }),
    )

    expect(past.outsideEnvelope).toBe(true)
    expect(below.outsideEnvelope).toBe(false)
  })
})
