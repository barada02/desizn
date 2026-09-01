import { create } from 'zustand'
import { evaluate, type AeroResults } from '../aero/evaluate'
import {
  DEFAULT_PARAMS,
  OPERATING_BOUNDS,
  WING_BOUNDS,
  clampToBound,
  isValidNaca,
  type AircraftParams,
  type NumericWingKey,
  type OperatingParams,
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
  setWing: (patch: Partial<WingParams>) => void
  setOperating: (patch: Partial<OperatingParams>) => void
  reset: () => void
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
  results: evaluate(DEFAULT_PARAMS),

  setWing: (patch) => {
    const { params } = get()
    const wing = sanitiseWing(patch, params.wing)
    const next: AircraftParams = { ...params, wing }
    set({ params: next, results: evaluate(next) })
  },

  setOperating: (patch) => {
    const { params } = get()
    const operating = sanitiseOperating(patch, params.operating)
    const next: AircraftParams = { ...params, operating }
    set({ params: next, results: evaluate(next) })
  },

  reset: () => set({ params: DEFAULT_PARAMS, results: evaluate(DEFAULT_PARAMS) }),
}))
