import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, WING_BOUNDS } from '../aero/params'
import {
  clearDesigns,
  deleteDesign,
  loadDesigns,
  saveDesign,
  storageAvailable,
} from './storage'

const KEY = 'desizn.designs.v1'

/** A minimal in-memory Storage, standing in for the browser's. */
function fakeStorage(options: { failWrites?: boolean; failReads?: boolean } = {}) {
  const map = new Map<string, string>()
  return {
    getItem(key: string) {
      if (options.failReads) throw new Error('blocked')
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (options.failWrites) throw new Error('quota')
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
    raw: map,
  } as unknown as Storage & { raw: Map<string, string> }
}

let storage: ReturnType<typeof fakeStorage>

function install(store: Storage | undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  storage = fakeStorage()
  install(storage)
})

afterEach(() => {
  install(undefined)
})

describe('saving and loading', () => {
  it('round-trips a design', () => {
    const result = saveDesign('My wing', {
      ...DEFAULT_PARAMS,
      wing: { ...DEFAULT_PARAMS.wing, span: 14.5 },
    })

    expect(result.ok).toBe(true)
    expect(loadDesigns()).toHaveLength(1)
    expect(loadDesigns()[0].name).toBe('My wing')
    expect(loadDesigns()[0].params.wing.span).toBe(14.5)
  })

  it('starts empty', () => {
    expect(loadDesigns()).toEqual([])
  })

  it('lists the newest first', () => {
    saveDesign('First', DEFAULT_PARAMS)
    saveDesign('Second', DEFAULT_PARAMS)
    saveDesign('Third', DEFAULT_PARAMS)

    expect(loadDesigns().map((d) => d.name)).toEqual(['Third', 'Second', 'First'])
  })

  it('replaces a design saved under the same name', () => {
    // Someone iterating on one design expects to overwrite it, not to collect
    // a dozen entries all called "trainer".
    saveDesign('Trainer', { ...DEFAULT_PARAMS, wing: { ...DEFAULT_PARAMS.wing, span: 9 } })
    saveDesign('trainer', { ...DEFAULT_PARAMS, wing: { ...DEFAULT_PARAMS.wing, span: 12 } })

    const designs = loadDesigns()
    expect(designs).toHaveLength(1)
    expect(designs[0].params.wing.span).toBe(12)
  })

  it('falls back to a name rather than saving a blank one', () => {
    saveDesign('   ', DEFAULT_PARAMS)
    expect(loadDesigns()[0].name).toBe('Untitled')
  })

  it('deletes by id', () => {
    const keep = saveDesign('Keep', DEFAULT_PARAMS).saved!
    const drop = saveDesign('Drop', DEFAULT_PARAMS).saved!

    const remaining = deleteDesign(drop.id)
    expect(remaining.map((d) => d.id)).toEqual([keep.id])
    expect(loadDesigns().map((d) => d.id)).toEqual([keep.id])
  })

  it('clears everything', () => {
    saveDesign('One', DEFAULT_PARAMS)
    clearDesigns()
    expect(loadDesigns()).toEqual([])
  })
})

describe('surviving what a browser actually does', () => {
  it('reports no storage when there is none', () => {
    install(undefined)
    expect(storageAvailable()).toBe(false)
    expect(loadDesigns()).toEqual([])
    expect(saveDesign('x', DEFAULT_PARAMS).ok).toBe(false)
  })

  it('says a write failed instead of throwing', () => {
    install(fakeStorage({ failWrites: true }))
    expect(() => saveDesign('x', DEFAULT_PARAMS)).not.toThrow()
    expect(saveDesign('x', DEFAULT_PARAMS).ok).toBe(false)
  })

  it('survives a read that throws', () => {
    install(fakeStorage({ failReads: true }))
    expect(loadDesigns()).toEqual([])
  })

  it('survives stored junk', () => {
    storage.setItem(KEY, 'not json at all')
    expect(loadDesigns()).toEqual([])

    storage.setItem(KEY, '{"not":"an array"}')
    expect(loadDesigns()).toEqual([])
  })

  it('drops an unreadable entry without losing the good ones', () => {
    storage.setItem(
      KEY,
      JSON.stringify([null, 'nonsense', { id: 'a', name: 'Good', savedAt: 5, params: {} }]),
    )

    const designs = loadDesigns()
    expect(designs).toHaveLength(1)
    expect(designs[0].name).toBe('Good')
  })
})

describe('what comes back out is safe to solve', () => {
  it('fills in anything the stored design was missing', () => {
    storage.setItem(KEY, JSON.stringify([{ id: 'a', name: 'Old', savedAt: 1, params: {} }]))

    const restored = loadDesigns()[0].params
    expect(restored).toEqual(DEFAULT_PARAMS)
  })

  it('clamps a stored value that is out of bounds', () => {
    // A design saved before a bound changed, or edited by hand, must not be
    // able to push the solver somewhere it has no honest answer.
    storage.setItem(
      KEY,
      JSON.stringify([
        { id: 'a', name: 'Wild', savedAt: 1, params: { wing: { span: 9999, taper: -3 } } },
      ]),
    )

    const wing = loadDesigns()[0].params.wing
    expect(wing.span).toBe(WING_BOUNDS.span.max)
    expect(wing.taper).toBe(WING_BOUNDS.taper.min)
  })

  it('rejects a solver name it does not recognise', () => {
    storage.setItem(
      KEY,
      JSON.stringify([{ id: 'a', name: 'x', savedAt: 1, params: { solver: 'wishful' } }]),
    )

    expect(loadDesigns()[0].params.solver).toBe(DEFAULT_PARAMS.solver)
  })
})
