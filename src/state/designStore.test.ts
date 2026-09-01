import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, WING_BOUNDS } from '../aero/params'
import { useDesign } from './designStore'

const store = () => useDesign.getState()

describe('designStore', () => {
  beforeEach(() => store().reset())

  it('starts from the defaults with results already computed', () => {
    expect(store().params).toEqual(DEFAULT_PARAMS)
    expect(store().results.cl).toBeGreaterThan(0)
  })

  it('recomputes results on every change', () => {
    const before = store().results.geometry.aspectRatio
    store().setWing({ span: 20 })

    expect(store().params.wing.span).toBe(20)
    expect(store().results.geometry.aspectRatio).not.toBeCloseTo(before, 6)
  })

  it('leaves untouched parameters alone', () => {
    store().setWing({ taper: 0.3 })

    expect(store().params.wing.taper).toBe(0.3)
    expect(store().params.wing.span).toBe(DEFAULT_PARAMS.wing.span)
    expect(store().params.operating).toEqual(DEFAULT_PARAMS.operating)
  })

  it('clamps anything out of bounds rather than trusting the caller', () => {
    // This is the guarantee an agent inherits: it gets exactly the reach a
    // slider has, and cannot push the solver somewhere it cannot answer.
    store().setWing({ span: 1e6, taper: -4 })

    expect(store().params.wing.span).toBe(WING_BOUNDS.span.max)
    expect(store().params.wing.taper).toBe(WING_BOUNDS.taper.min)
  })

  it('ignores values that are not finite numbers', () => {
    store().setWing({ span: Number.NaN, rootChord: Infinity })

    expect(store().params.wing.span).toBe(DEFAULT_PARAMS.wing.span)
    expect(store().params.wing.rootChord).toBe(DEFAULT_PARAMS.wing.rootChord)
  })

  it('accepts a valid airfoil code and rejects a broken one', () => {
    store().setWing({ naca: '4415' })
    expect(store().params.wing.naca).toBe('4415')

    store().setWing({ naca: '0000' })
    expect(store().params.wing.naca).toBe('4415')

    store().setWing({ naca: '12' })
    expect(store().params.wing.naca).toBe('4415')
  })

  it('clamps the flight condition too', () => {
    store().setOperating({ alpha: 90, altitude: -2000 })

    expect(store().params.operating.alpha).toBe(16)
    expect(store().params.operating.altitude).toBe(0)
  })

  it('returns to the defaults on reset', () => {
    store().setWing({ span: 25, taper: 0.9 })
    store().setOperating({ speed: 110 })
    store().reset()

    expect(store().params).toEqual(DEFAULT_PARAMS)
  })
})
