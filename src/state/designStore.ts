import { create } from 'zustand'
import type { AeroResults } from '../aero/evaluate'
import type { SolverKind } from '../aero/solver'
import type { DragPolar } from '../aero/polar'
import { DEFAULT_BRIEF, briefById } from '../design/briefs'
import { compare, scoreComparison, type ComparisonScore, type Delta } from '../design/compare'
import { checkBrief, type BriefCheck } from '../design/requirements'
import { analyse, type DesignSnapshot } from '../design/snapshot'
import {
  deleteDesign,
  loadDesigns,
  saveDesign,
  storageAvailable,
  type SavedDesign,
} from '../design/storage'
import {
  DEFAULT_PARAMS,
  sanitiseBalance,
  sanitiseOperating,
  sanitiseTail,
  sanitiseWing,
  type AircraftParams,
  type BalanceParams,
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
  /** A design held for comparison, if one has been pinned */
  pinned: DesignSnapshot | null
  /** Metric-by-metric difference from the pinned design */
  deltas: Delta[]
  score: ComparisonScore | null
  /** Designs saved on this machine, newest first */
  saved: SavedDesign[]
  /** False when the browser will not let us keep a library at all */
  storageOk: boolean
  setWing: (patch: Partial<WingParams>) => void
  setTail: (patch: Partial<TailParams>) => void
  setBalance: (patch: Partial<BalanceParams>) => void
  setOperating: (patch: Partial<OperatingParams>) => void
  setSolver: (solver: SolverKind) => void
  setBrief: (briefId: string) => void
  pin: () => void
  unpin: () => void
  saveCurrent: (name: string) => boolean
  loadSaved: (id: string) => void
  removeSaved: (id: string) => void
  reset: () => void
}

/**
 * Re-evaluate the design, re-check it against the brief, and re-measure it
 * against whatever is pinned. Every path that changes a parameter goes through
 * here, so those three can never fall out of step with each other.
 */
function refresh(
  params: AircraftParams,
  briefId: string,
  pinned: DesignSnapshot | null,
) {
  const snapshot = analyse(params)
  const deltas = pinned ? compare(pinned, snapshot) : []

  return {
    ...snapshot,
    briefId,
    brief: checkBrief(briefById(briefId), snapshot),
    pinned,
    deltas,
    score: pinned ? scoreComparison(deltas) : null,
  }
}

export const useDesign = create<DesignState>((set, get) => ({
  ...refresh(DEFAULT_PARAMS, DEFAULT_BRIEF, null),
  saved: loadDesigns(),
  storageOk: storageAvailable(),

  setWing: (patch) => {
    const { params } = get()
    const wing = sanitiseWing(patch, params.wing)
    set(refresh({ ...params, wing }, get().briefId, get().pinned))
  },

  setTail: (patch) => {
    const { params } = get()
    set(refresh({ ...params, tail: sanitiseTail(patch, params.tail) }, get().briefId, get().pinned))
  },

  setBalance: (patch) => {
    const { params } = get()
    set(
      refresh(
        { ...params, balance: sanitiseBalance(patch, params.balance) },
        get().briefId,
        get().pinned,
      ),
    )
  },

  setOperating: (patch) => {
    const { params } = get()
    const operating = sanitiseOperating(patch, params.operating)
    set(refresh({ ...params, operating }, get().briefId, get().pinned))
  },

  setSolver: (solver) => {
    set(refresh({ ...get().params, solver }, get().briefId, get().pinned))
  },

  setBrief: (briefId) => {
    set(refresh(get().params, briefId, get().pinned))
  },

  reset: () => set(refresh(DEFAULT_PARAMS, get().briefId, get().pinned)),

  // Pinning captures the design as it stands, so later edits are measured
  // against it rather than against a moving target.
  pin: () => {
    const { params, results, polar, briefId } = get()
    set(refresh(params, briefId, { params, results, polar }))
  },

  unpin: () => set(refresh(get().params, get().briefId, null)),

  saveCurrent: (name) => {
    const { designs, ok } = saveDesign(name, get().params)
    set({ saved: designs, storageOk: storageAvailable() })
    return ok
  },

  loadSaved: (id) => {
    const design = get().saved.find((entry) => entry.id === id)
    if (!design) return
    set(refresh(design.params, get().briefId, get().pinned))
  },

  removeSaved: (id) => set({ saved: deleteDesign(id) }),
}))
