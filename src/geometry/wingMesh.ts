/**
 * Lofting the wing: airfoil sections stacked along the span and skinned.
 *
 * The mesh maths is kept free of Three.js so it can be tested on its own; the
 * thin wrapper at the bottom is the only part that knows about buffers.
 *
 * Scene axes:
 *   x  spanwise, starboard positive
 *   y  up
 *   z  streamwise, trailing edge positive
 *
 * Sections are rotated about their quarter chord, which is where a wing is
 * actually twisted and keeps the aerodynamic centre on a straight line.
 */

import { BufferAttribute, BufferGeometry } from 'three'
import { airfoilCoordinates, parseNaca } from '../aero/airfoil'
import { chordAt, dihedralZ, leadingEdgeX, twistAt } from '../aero/planform'
import { DEG, type WingParams } from '../aero/params'

export interface WingMeshOptions {
  /** Sections across the full span; more makes twist and taper read smoothly */
  spanSections?: number
  /** Chordwise stations per section */
  chordStations?: number
}

export interface WingMeshData {
  positions: Float32Array
  indices: Uint32Array
  /** Spanwise fraction (-1 at the port tip, +1 at starboard) per vertex */
  eta: Float32Array
  /** Points around one section contour */
  contourLength: number
  /** Number of stacked sections */
  sectionCount: number
}

const PIVOT = 0.25

export function wingMeshData(
  wing: WingParams,
  options: WingMeshOptions = {},
): WingMeshData {
  const spanSections = options.spanSections ?? 33
  const chordStations = options.chordStations ?? 60

  const section = parseNaca(wing.naca)
  const contour = airfoilCoordinates(section, chordStations)
  const contourLength = contour.length
  const halfSpan = wing.span / 2

  const vertexCount = spanSections * contourLength
  // Two tip caps, each fanned from an extra centre vertex.
  const positions = new Float32Array((vertexCount + 2) * 3)
  const eta = new Float32Array(vertexCount + 2)

  for (let s = 0; s < spanSections; s++) {
    const t = s / (spanSections - 1)
    const y = -halfSpan + t * wing.span

    const chord = chordAt(wing, y)
    const leadX = leadingEdgeX(wing, y)
    const rise = dihedralZ(wing, y)
    const twist = twistAt(wing, y) * DEG
    const sin = Math.sin(twist)
    const cos = Math.cos(twist)

    for (let i = 0; i < contourLength; i++) {
      const point = contour[i]

      // Offsets from the quarter-chord pivot, in chord fractions.
      const u = point.x - PIVOT
      const v = point.z

      // Positive twist pitches the leading edge up.
      const uRot = u * cos + v * sin
      const vRot = v * cos - u * sin

      const index = (s * contourLength + i) * 3
      positions[index] = y
      positions[index + 1] = rise + vRot * chord
      positions[index + 2] = leadX + (PIVOT + uRot) * chord
      eta[s * contourLength + i] = y / halfSpan
    }
  }

  // Cap centres: the mean of each tip contour.
  const capCentre = (s: number, vertex: number) => {
    let x = 0
    let y = 0
    let z = 0
    for (let i = 0; i < contourLength; i++) {
      const index = (s * contourLength + i) * 3
      x += positions[index]
      y += positions[index + 1]
      z += positions[index + 2]
    }
    positions[vertex * 3] = x / contourLength
    positions[vertex * 3 + 1] = y / contourLength
    positions[vertex * 3 + 2] = z / contourLength
    eta[vertex] = s === 0 ? -1 : 1
  }

  const portCentre = vertexCount
  const starboardCentre = vertexCount + 1
  capCentre(0, portCentre)
  capCentre(spanSections - 1, starboardCentre)

  const triangles = (spanSections - 1) * contourLength * 2 + contourLength * 2
  const indices = new Uint32Array(triangles * 3)
  let head = 0

  const push = (a: number, b: number, c: number) => {
    indices[head++] = a
    indices[head++] = b
    indices[head++] = c
  }

  for (let s = 0; s < spanSections - 1; s++) {
    for (let i = 0; i < contourLength; i++) {
      const next = (i + 1) % contourLength
      const a = s * contourLength + i
      const b = s * contourLength + next
      const c = (s + 1) * contourLength + i
      const d = (s + 1) * contourLength + next

      push(a, c, d)
      push(a, d, b)
    }
  }

  for (let i = 0; i < contourLength; i++) {
    const next = (i + 1) % contourLength
    // Port tip faces outboard in -x, so it winds the other way round.
    push(portCentre, i, next)
    push(
      starboardCentre,
      (spanSections - 1) * contourLength + next,
      (spanSections - 1) * contourLength + i,
    )
  }

  return { positions, indices, eta, contourLength, sectionCount: spanSections }
}

/** The same loft, handed to Three.js. */
export function buildWingGeometry(
  wing: WingParams,
  options?: WingMeshOptions,
): BufferGeometry {
  const data = wingMeshData(wing, options)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('aEta', new BufferAttribute(data.eta, 1))
  geometry.setIndex(new BufferAttribute(data.indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return geometry
}
