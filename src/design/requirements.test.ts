import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type AircraftParams } from '../aero/params'
import { BRIEFS, briefById } from './briefs'
import { checkBrief, describeLimits, type Requirement } from './requirements'
import { analyse, type DesignSnapshot } from './snapshot'

/**
 * A design that satisfies each brief, found by searching the parameter space.
 *
 * These are here to prove the briefs are possible. A requirement set nobody can
 * satisfy is not a challenge, it is a bug - and it would be an invisible one
 * without this.
 */
const SOLUTIONS: Record<string, AircraftParams> = {
  trainer: {
    ...DEFAULT_PARAMS,
    wing: {
      span: 8.523,
      rootChord: 2.253,
      taper: 0.502,
      sweepQuarter: 9.183,
      twist: -4.558,
      dihedral: 2.544,
      naca: '4415',
    },
    tail: { span: 3.815, rootChord: 0.617, taper: 0.8, arm: 5.677, incidence: -1.5, naca: '0009' },
    balance: { cg: 0.323 },
    operating: { alpha: 4.336, speed: 50.339, altitude: 0, mass: 978.359 },
  },
  glider: {
    ...DEFAULT_PARAMS,
    wing: {
      span: 16.654,
      rootChord: 1.811,
      taper: 0.591,
      sweepQuarter: -4.188,
      twist: -1.595,
      dihedral: 2.688,
      naca: '0012',
    },
    tail: { span: 3.515, rootChord: 0.595, taper: 0.8, arm: 4.249, incidence: -1.5, naca: '0009' },
    balance: { cg: 0.286 },
    operating: { alpha: 3.26, speed: 78.572, altitude: 0, mass: 883.622 },
  },
  stol: {
    ...DEFAULT_PARAMS,
    wing: {
      span: 15.798,
      rootChord: 1.899,
      taper: 0.759,
      sweepQuarter: -0.839,
      twist: -2.113,
      dihedral: 5.288,
      naca: '4412',
    },
    tail: { span: 3.509, rootChord: 0.723, taper: 0.8, arm: 5.769, incidence: -1.5, naca: '0009' },
    balance: { cg: 0.296 },
    operating: { alpha: 1.358, speed: 69.197, altitude: 0, mass: 1149.199 },
  },
  racer: {
    ...DEFAULT_PARAMS,
    wing: {
      span: 4.982,
      rootChord: 2.105,
      taper: 0.728,
      sweepQuarter: 6.961,
      twist: -4.658,
      dihedral: 7.552,
      naca: '4412',
    },
    tail: { span: 4.911, rootChord: 0.855, taper: 0.8, arm: 4.119, incidence: -1.5, naca: '0009' },
    balance: { cg: 0.451 },
    operating: { alpha: 5.323, speed: 106.142, altitude: 0, mass: 1165.578 },
  },
}

const design = (params: AircraftParams): DesignSnapshot => analyse(params)

describe('every brief is possible', () => {
  for (const [id, params] of Object.entries(SOLUTIONS)) {
    it(`has a design that satisfies "${briefById(id).name}"`, () => {
      const check = checkBrief(briefById(id), design(params))

      const missed = check.checks
        .filter((c) => !c.passes)
        .map((c) => `${c.requirement.label} = ${c.value.toFixed(2)}`)

      expect(missed).toEqual([])
      expect(check.allMet).toBe(true)
    })
  }
})

describe('briefs are demanding', () => {
  it('are not all satisfied by the design the app opens on', () => {
    // If the shipped default met every brief there would be nothing to do.
    const shipped = design(DEFAULT_PARAMS)
    const demanding = BRIEFS.filter((b) => b.requirements.length > 0).filter(
      (b) => !checkBrief(b, shipped).allMet,
    )

    expect(demanding.length).toBeGreaterThan(2)
  })

  it('leaves free play with nothing to satisfy', () => {
    const check = checkBrief(briefById('free'), design(DEFAULT_PARAMS))

    expect(check.total).toBe(0)
    expect(check.allMet).toBe(true)
  })

  it('falls back to free play for an unknown id', () => {
    expect(briefById('nonsense').id).toBe('free')
  })
})

describe('checking a requirement', () => {
  const snapshot = design(DEFAULT_PARAMS)
  const constant = (value: number, bounds: Partial<Requirement>): Requirement => ({
    id: 'test',
    label: 'Test',
    detail: '',
    unit: 'm',
    measure: () => value,
    ...bounds,
  })

  const single = (requirement: Requirement) =>
    checkBrief({ id: 'x', name: 'x', summary: '', requirements: [requirement] }, snapshot)
      .checks[0]

  it('passes a lower bound that is met', () => {
    const check = single(constant(12, { min: 10 }))
    expect(check.passes).toBe(true)
    expect(check.direction).toBe(null)
    expect(check.slack).toBeGreaterThan(0)
  })

  it('fails a lower bound that is missed, and says which way to go', () => {
    const check = single(constant(8, { min: 10 }))
    expect(check.passes).toBe(false)
    expect(check.direction).toBe('higher')
    expect(check.slack).toBeLessThan(0)
  })

  it('fails an upper bound that is exceeded', () => {
    const check = single(constant(14, { max: 10 }))
    expect(check.passes).toBe(false)
    expect(check.direction).toBe('lower')
  })

  it('accepts a value inside a range and reports the nearer edge', () => {
    const check = single(constant(11, { min: 10, max: 20 }))
    expect(check.passes).toBe(true)
    // 11 is one unit above the floor and nine below the ceiling, out of ten.
    expect(check.slack).toBeCloseTo(0.1, 6)
  })

  it('treats the bounds as inclusive', () => {
    expect(single(constant(10, { min: 10 })).passes).toBe(true)
    expect(single(constant(10, { max: 10 })).passes).toBe(true)
  })

  it('counts how many of a brief are met', () => {
    const check = checkBrief(
      {
        id: 'x',
        name: 'x',
        summary: '',
        requirements: [
          constant(5, { min: 1 }),
          constant(5, { max: 1 }),
          constant(5, { min: 1, max: 9 }),
        ],
      },
      snapshot,
    )

    expect(check.met).toBe(2)
    expect(check.total).toBe(3)
    expect(check.allMet).toBe(false)
  })
})

describe('describeLimits', () => {
  const base = { id: 'x', label: 'x', detail: '', measure: () => 0 }

  it('reads the way the requirement would be spoken', () => {
    expect(describeLimits({ ...base, unit: 'm', min: 4 })).toBe('at least 4 m')
    expect(describeLimits({ ...base, unit: 'm/s', max: 26, decimals: 1 })).toBe(
      'at most 26.0 m/s',
    )
    expect(describeLimits({ ...base, unit: '%', min: 8, max: 20 })).toBe('8 to 20 %')
    expect(describeLimits({ ...base, unit: '' })).toBe('unconstrained')
  })
})
