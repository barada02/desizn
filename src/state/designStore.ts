import { create } from 'zustand'
import { evaluateWith, type AeroResults } from '../aero/evaluate'
import { factorSurface, type SolverKind } from '../aero/solver'
import { dragPolarWith, type DragPolar } from '../aero/polar'
import {
  BALANCE_BOUNDS,
  DEFAULT_PARAMS,
  OPERATING_BOUNDS,
  TAIL_BOUNDS,
  WING_BOUNDS,
  clampToBound,
  isValidNaca,
  type AircraftParams,
  type BalanceParams,
  type NumericTailKey,
  type NumericWingKey,
  type OperatingParams,
  type TailParams,
  type WingParams,
} from '../aero/params'

/**
 * The one piece of writable state in the app.
 *
 * Parameters go in through setWing and setOperating; results come back out and
 * are never written to from anywhere else. That is deliberate - it is the same
 * door a WebMCP tool will eventually knock on, so an agent gets exactly the
 * access a slider has, no more.
 */
export interface DesignState {
  params: AircraftParams
  results: AeroResults
  polar: DragPolar
  setWing: (patch: Partial<WingParams>) => void
  setTail: (patch: Partial<TailParams>) => void
  setBalance: (patch: Partial<BalanceParams>) => void
  setOperating: (patch: Partial<OperatingParams>) => void
  setSolver: (solver: SolverKind) => void
  reset: () => void
}

/**
 * One factorisation feeds both the point results and the whole polar sweep -
 * the expensive part of the solve depends only on the wing's shape, so doing it
 * twice would be pure waste.
 */
function analyse(params: AircraftParams): { results: AeroResults; polar: DragPolar } {
  const solution = factorSurface(params.wing, params.solver)
  return {
    results: evaluateWith(solution, params),
    polar: dragPolarWith(solution, params),
  }
}

/** Hold an incoming patch inside the declared bounds before it reaches state. */
function sanitiseWing(patch: Partial<WingParams>, current: WingParams): WingParams {
  const next: WingParams = { ...current }

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'naca') {
      if (typeof value === 'string' && isValidNaca(value)) next.naca = value
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const bound = WING_BOUNDS[key as NumericWingKey]
    if (bound) next[key as NumericWingKey] = clampToBound(value, bound)
  }

  return next
}

function sanitiseTail(patch: Partial<TailParams>, current: TailParams): TailParams {
  const next: TailParams = { ...current }

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'naca') {
      if (typeof value === 'string' && isValidNaca(value)) next.naca = value
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const bound = TAIL_BOUNDS[key as NumericTailKey]
    if (bound) next[key as NumericTailKey] = clampToBound(value, bound)
  }

  return next
}

function sanitiseBalance(
  patch: Partial<BalanceParams>,
  current: BalanceParams,
): BalanceParams {
  const next: BalanceParams = { ...current }

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const bound = BALANCE_BOUNDS[key as keyof BalanceParams]
    if (bound) next[key as keyof BalanceParams] = clampToBound(value, bound)
  }

  return next
}

function sanitiseOperating(
  patch: Partial<OperatingParams>,
  current: OperatingParams,
): OperatingParams {
  const next: OperatingParams = { ...current }

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const bound = OPERATING_BOUNDS[key as keyof OperatingParams]
    if (bound) next[key as keyof OperatingParams] = clampToBound(value, bound)
  }

  return next
}

export const useDesign = create<DesignState>((set, get) => ({
  params: DEFAULT_PARAMS,
  ...analyse(DEFAULT_PARAMS),

  setWing: (patch) => {
    const { params } = get()
    const wing = sanitiseWing(patch, params.wing)
    const next: AircraftParams = { ...params, wing }
    set({ params: next, ...analyse(next) })
  },

  setTail: (patch) => {
    const { params } = get()
    const next: AircraftParams = { ...params, tail: sanitiseTail(patch, params.tail) }
    set({ params: next, ...analyse(next) })
  },

  setBalance: (patch) => {
    const { params } = get()
    const next: AircraftParams = {
      ...params,
      balance: sanitiseBalance(patch, params.balance),
    }
    set({ params: next, ...analyse(next) })
  },

  setOperating: (patch) => {
    const { params } = get()
    const operating = sanitiseOperating(patch, params.operating)
    const next: AircraftParams = { ...params, operating }
    set({ params: next, ...analyse(next) })
  },

  setSolver: (solver) => {
    const next: AircraftParams = { ...get().params, solver }
    set({ params: next, ...analyse(next) })
  },

  reset: () => set({ params: DEFAULT_PARAMS, ...analyse(DEFAULT_PARAMS) }),
}))
