/**
 * Saved designs.
 *
 * A design tool you cannot save from is a calculator. This keeps named designs
 * in the browser, on the machine they were made on - nothing leaves the device.
 *
 * Everything here treats storage as something that can fail or be missing.
 * Private windows, disabled site data and quota limits are all normal, and none
 * of them should take the studio down with them - the app just carries on
 * without a library.
 */

import { coerceParams, type AircraftParams } from '../aero/params'

const KEY = 'desizn.designs.v1'

export interface SavedDesign {
  id: string
  name: string
  /** Milliseconds since the epoch */
  savedAt: number
  params: AircraftParams
}

/** The store, when there is one. Reading it can throw, so it is guarded. */
function backend(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function storageAvailable(): boolean {
  return backend() !== null
}

function newId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Everything saved, newest first.
 *
 * Anything unreadable is dropped rather than thrown: a corrupt entry should
 * cost you that entry, not the whole library.
 */
export function loadDesigns(): SavedDesign[] {
  const store = backend()
  if (!store) return []

  let raw: string | null
  try {
    raw = store.getItem(KEY)
  } catch {
    return []
  }
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : newId(),
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : 'Untitled',
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
      params: coerceParams(entry.params),
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

/** Returns false when the write could not be made, rather than throwing. */
function write(designs: SavedDesign[]): boolean {
  const store = backend()
  if (!store) return false

  try {
    store.setItem(KEY, JSON.stringify(designs))
    return true
  } catch {
    return false
  }
}

export interface SaveResult {
  saved: SavedDesign | null
  designs: SavedDesign[]
  ok: boolean
}

/**
 * Save under a name. Saving again under an existing name replaces it, which is
 * what someone iterating on one design expects.
 */
export function saveDesign(name: string, params: AircraftParams): SaveResult {
  const trimmed = name.trim() || 'Untitled'
  const existing = loadDesigns()
  const previous = existing.find(
    (design) => design.name.toLowerCase() === trimmed.toLowerCase(),
  )

  const saved: SavedDesign = {
    id: previous?.id ?? newId(),
    name: trimmed,
    savedAt: Date.now(),
    params: coerceParams(params),
  }

  const designs = [saved, ...existing.filter((design) => design.id !== saved.id)].sort(
    (a, b) => b.savedAt - a.savedAt,
  )

  return { saved, designs, ok: write(designs) }
}

export function deleteDesign(id: string): SavedDesign[] {
  const designs = loadDesigns().filter((design) => design.id !== id)
  write(designs)
  return designs
}

export function clearDesigns(): void {
  const store = backend()
  try {
    store?.removeItem(KEY)
  } catch {
    // Nothing to do - the library is already effectively gone.
  }
}
