import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type WingParams } from './params'
import { DEFAULT_SOLVER, SOLVERS, factorSurface, type SolverKind } from './solver'

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  ...over,
})

describe('solver registry', () => {
  it('is honest about which theory can see sweep', () => {
    expect(SOLVERS['lifting-line'].seesSweep).toBe(false)
    expect(SOLVERS['vortex-lattice'].seesSweep).toBe(true)
  })

  it('defaults to the one that sees the geometry', () => {
    expect(SOLVERS[DEFAULT_SOLVER].seesSweep).toBe(true)
    expect(DEFAULT_PARAMS.solver).toBe(DEFAULT_SOLVER)
  })
})

describe('factorSurface caching', () => {
  it('reuses the factorisation while the wing object is unchanged', () => {
    // This is what makes dragging airspeed or incidence cheap: neither can
    // change the factorisation, and neither builds a new wing object.
    const w = wing()
    expect(factorSurface(w, 'vortex-lattice')).toBe(factorSurface(w, 'vortex-lattice'))
  })

  it('refactors when the wing actually changes', () => {
    const first = factorSurface(wing({ span: 11 }), 'vortex-lattice')
    const second = factorSurface(wing({ span: 12 }), 'vortex-lattice')

    expect(first).not.toBe(second)
    expect(second.at(5).aspectRatio).not.toBeCloseTo(first.at(5).aspectRatio, 3)
  })

  it('refactors when the theory changes', () => {
    const w = wing()
    const lattice = factorSurface(w, 'vortex-lattice')
    const line = factorSurface(w, 'lifting-line')

    expect(line).not.toBe(lattice)
    expect(line.kind).toBe('lifting-line')
    expect(lattice.kind).toBe('vortex-lattice')
  })

  it('returns the same numbers cached as uncached', () => {
    const w = wing({ sweepQuarter: 20 })

    const first = factorSurface(w, 'vortex-lattice').at(6).cl
    factorSurface(wing({ span: 20 }), 'lifting-line') // evict
    const second = factorSurface(w, 'vortex-lattice').at(6).cl

    expect(second).toBe(first)
  })
})

describe('both solvers', () => {
  it('agree on a straight slender wing, where both are valid', () => {
    const w = wing({ span: 24, rootChord: 0.8, sweepQuarter: 0, dihedral: 0 })
    const kinds: SolverKind[] = ['lifting-line', 'vortex-lattice']
    const [line, lattice] = kinds.map((kind) => factorSurface(w, kind).at(5).cl)

    expect(Math.abs(lattice - line) / line).toBeLessThan(0.05)
  })

  it('return the same shape of result, so callers need not care', () => {
    const w = wing()
    for (const kind of ['lifting-line', 'vortex-lattice'] as SolverKind[]) {
      const r = factorSurface(w, kind).at(5)
      expect(Object.keys(r).sort()).toEqual(
        [
          'aspectRatio',
          'cdi',
          'cl',
          'clAlpha',
          'coefficients',
          'delta',
          'spanEfficiency',
          'stations',
          'zeroLiftAlpha',
        ].sort(),
      )
    }
  })
})
