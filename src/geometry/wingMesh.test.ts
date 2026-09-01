import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type WingParams } from '../aero/params'
import { wingMeshData } from './wingMesh'

const wing = (over: Partial<WingParams> = {}): WingParams => ({
  ...DEFAULT_PARAMS.wing,
  ...over,
})

function vertex(data: { positions: Float32Array }, i: number) {
  return {
    x: data.positions[i * 3],
    y: data.positions[i * 3 + 1],
    z: data.positions[i * 3 + 2],
  }
}

/**
 * Signed volume of a closed triangle mesh, by the divergence theorem. It is
 * positive only when every face winds counter-clockwise seen from outside, so
 * one number checks both closure and winding.
 */
function signedVolume(data: { positions: Float32Array; indices: Uint32Array }) {
  let total = 0
  for (let t = 0; t < data.indices.length; t += 3) {
    const a = vertex(data, data.indices[t])
    const b = vertex(data, data.indices[t + 1])
    const c = vertex(data, data.indices[t + 2])

    total +=
      a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x)
  }
  return total / 6
}

describe('wingMeshData', () => {
  it('builds the vertex and index counts it promises', () => {
    const data = wingMeshData(wing(), { spanSections: 9, chordStations: 20 })
    const contour = 2 * 20 - 2

    expect(data.contourLength).toBe(contour)
    expect(data.sectionCount).toBe(9)
    // Section vertices plus the two tip-cap centres.
    expect(data.positions.length / 3).toBe(9 * contour + 2)
    expect(data.indices.length / 3).toBe(8 * contour * 2 + contour * 2)
  })

  it('spans exactly the requested span', () => {
    const data = wingMeshData(wing({ span: 12.4 }))

    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < data.positions.length; i += 3) {
      min = Math.min(min, data.positions[i])
      max = Math.max(max, data.positions[i])
    }

    expect(min).toBeCloseTo(-6.2, 5)
    expect(max).toBeCloseTo(6.2, 5)
  })

  it('is a closed surface with its faces pointing outwards', () => {
    const data = wingMeshData(wing())
    const volume = signedVolume(data)

    // A 12% thick wing of this planform holds a little under a cubic metre.
    expect(volume).toBeGreaterThan(0.6)
    expect(volume).toBeLessThan(1.2)
  })

  it('scales its volume with thickness', () => {
    const thin = signedVolume(wingMeshData(wing({ naca: '2406' })))
    const thick = signedVolume(wingMeshData(wing({ naca: '2418' })))

    expect(thick).toBeGreaterThan(thin * 2)
  })

  it('lifts the tips when dihedral is applied', () => {
    const flat = wingMeshData(wing({ dihedral: 0, twist: 0 }))
    const veed = wingMeshData(wing({ dihedral: 10, twist: 0 }))

    const tipHeight = (data: ReturnType<typeof wingMeshData>) => {
      let max = -Infinity
      for (let i = 1; i < data.positions.length; i += 3) {
        max = Math.max(max, data.positions[i])
      }
      return max
    }

    expect(tipHeight(veed)).toBeGreaterThan(tipHeight(flat) + 0.5)
  })

  it('sweeps the tip aft', () => {
    const straight = wingMeshData(wing({ sweepQuarter: 0 }))
    const swept = wingMeshData(wing({ sweepQuarter: 30 }))

    const trailingEdge = (data: ReturnType<typeof wingMeshData>) => {
      let max = -Infinity
      for (let i = 2; i < data.positions.length; i += 3) {
        max = Math.max(max, data.positions[i])
      }
      return max
    }

    expect(trailingEdge(swept)).toBeGreaterThan(trailingEdge(straight) + 1)
  })

  it('pitches the leading edge up for positive twist', () => {
    // Compare the tip section's leading edge with and without twist. Washout
    // (negative twist) has to drop it.
    const leadingEdgeHeightAtTip = (twist: number) => {
      const data = wingMeshData(wing({ twist, dihedral: 0 }), {
        spanSections: 9,
        chordStations: 20,
      })
      const contour = data.contourLength
      // Index contour/2 is the leading edge of the last section.
      const base = (data.sectionCount - 1) * contour + Math.floor(contour / 2)
      return vertex(data, base).y
    }

    expect(leadingEdgeHeightAtTip(6)).toBeGreaterThan(leadingEdgeHeightAtTip(0))
    expect(leadingEdgeHeightAtTip(-6)).toBeLessThan(leadingEdgeHeightAtTip(0))
  })

  it('produces no NaN for any corner of the parameter space', () => {
    const corners: Partial<WingParams>[] = [
      { taper: 0.2, sweepQuarter: 45, twist: -8, dihedral: 12, naca: '0006' },
      { taper: 1, sweepQuarter: -10, twist: 4, dihedral: -5, naca: '4421' },
      { span: 4, rootChord: 4, taper: 0.2 },
      { span: 30, rootChord: 0.3, taper: 1 },
    ]

    for (const corner of corners) {
      const data = wingMeshData(wing(corner))
      for (const value of data.positions) {
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(signedVolume(data)).toBeGreaterThan(0)
    }
  })

  it('tags every vertex with its spanwise fraction', () => {
    const data = wingMeshData(wing(), { spanSections: 5, chordStations: 12 })

    expect(Math.min(...data.eta)).toBeCloseTo(-1, 5)
    expect(Math.max(...data.eta)).toBeCloseTo(1, 5)
  })
})
