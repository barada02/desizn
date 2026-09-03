import { create } from 'zustand'
import type { AeroResults } from '../aero/evaluate'
import type { SolverKind } from '../aero/solver'
import type { DragPolar } from '../aero/polar'
import { DEFAULT_BRIEF, briefById } from '../design/briefs'
import { checkBrief, type BriefCheck } from '../design/requirements'
import { analyse } from '../design/snapshot'
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
  /** The brief being designed against */
  briefId: string
  /** How the current design measures up to it */
  brief: BriefCheck
  setWing: (patch: Partial<WingParams>) => void
  setTail: (patch: Partial<TailParams>) => void
  setBalance: (patch: Partial<BalanceParams>) => void
  setOperating: (patch: Partial<OperatingParams>) => void
  setSolver: (solver: SolverKind) => void
  setBrief: (briefId: string) => void
  reset: () => void
}

/** Re-evaluate the design and re-check it against whichever brief is active. */
function refresh(params: AircraftParams, briefId: string) {
  const snapshot = analyse(params)
  return { ...snapshot, briefId, brief: checkBrief(briefById(briefId), snapshot) }
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
  ...refresh(DEFAULT_PARAMS, DEFAULT_BRIEF),

  setWing: (patch) => {
    const { params } = get()
    const wing = sanitiseWing(patch, params.wing)
    set(refresh({ ...params, wing }, get().briefId))
  },

  setTail: (patch) => {
    const { params } = get()
    set(refresh({ ...params, tail: sanitiseTail(patch, params.tail) }, get().briefId))
  },

  setBalance: (patch) => {
    const { params } = get()
    set(
      refresh(
        { ...params, balance: sanitiseBalance(patch, params.balance) },
        get().briefId,
      ),
    )
  },

  setOperating: (patch) => {
    const { params } = get()
    const operating = sanitiseOperating(patch, params.operating)
    set(refresh({ ...params, operating }, get().briefId))
  },

  setSolver: (solver) => {
    set(refresh({ ...get().params, solver }, get().briefId))
  },

  setBrief: (briefId) => {
    set(refresh(get().params, briefId))
  },

  reset: () => set(refresh(DEFAULT_PARAMS, get().briefId)),
}))
