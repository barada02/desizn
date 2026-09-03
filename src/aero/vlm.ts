/**
 * Vortex-lattice method.
 *
 * Lifting-line theory puts all of the bound vorticity on a single straight line
 * across the span, which is why it cannot see sweep or dihedral - the geometry
 * it is handed has neither. This replaces that line with a lattice of horseshoe
 * vortices laid along the actual quarter-chord line, so where the wing really
 * is starts to matter.
 *
 * One chordwise row of panels, bound vortex on the quarter chord and the
 * boundary condition enforced at the three-quarter chord. That placement is
 * Weissinger's, and it is what makes a single row reproduce two-dimensional
 * thin-airfoil theory exactly in the limit - so the method degrades gracefully
 * to the answer lifting-line already gives on a straight wing.
 *
 * The freestream is linearised to V(1, 0, alpha), as every linear panel method
 * does. That keeps the circulation exactly affine in incidence, which is what
 * lets one factorisation serve any angle, and keeps the closed-form trim and
 * stall solutions downstream valid.
 *
 * Axes here are aerodynamic, not the scene's:
 *   x  downstream      y  spanwise, starboard positive      z  up
 */

import { sectionProperties, type SectionProperties } from './airfoil'
import { DEG, type WingParams } from './params'
import {
  chordAt,
  dihedralZ,
  leadingEdgeX,
  planform,
  quarterChordX,
  twistAt,
} from './planform'
import type { LiftingLineResult, SpanStation } from './llt'

type Vec3 = [number, number, number]

const FOUR_PI = 4 * Math.PI
const TWO_PI = 2 * Math.PI
const EPSILON = 1e-10

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}

/** Velocity at p from a unit-strength straight vortex filament running x1 -> x2. */
function segmentVelocity(p: Vec3, x1: Vec3, x2: Vec3): Vec3 {
  const r1 = sub(p, x1)
  const r2 = sub(p, x2)
  const r0 = sub(x2, x1)

  const c = cross(r1, r2)
  const cSquared = dot(c, c)
  const l1 = norm(r1)
  const l2 = norm(r2)

  if (cSquared < EPSILON || l1 < EPSILON || l2 < EPSILON) return [0, 0, 0]

  const k = (dot(r0, r1) / l1 - dot(r0, r2) / l2) / (FOUR_PI * cSquared)
  return [c[0] * k, c[1] * k, c[2] * k]
}

/**
 * Velocity at p from a unit-strength filament leaving x1 and running to
 * infinity along the unit vector d.
 */
function trailingVelocity(p: Vec3, x1: Vec3, d: Vec3): Vec3 {
  const r = sub(p, x1)
  const c = cross(d, r)
  const cSquared = dot(c, c)
  const length = norm(r)

  if (cSquared < EPSILON || length < EPSILON) return [0, 0, 0]

  const k = (1 + dot(d, r) / length) / (FOUR_PI * cSquared)
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** Downstream direction the wake trails in. */
const WAKE: Vec3 = [1, 0, 0]

/**
 * Velocity at p from a unit-strength horseshoe: in from downstream infinity to
 * a, along the bound segment a -> b, then back out to infinity from b.
 */
function horseshoeVelocity(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const bound = segmentVelocity(p, a, b)
  const fromB = trailingVelocity(p, b, WAKE)
  const intoA = trailingVelocity(p, a, WAKE)

  return [
    bound[0] + fromB[0] - intoA[0],
    bound[1] + fromB[1] - intoA[1],
    bound[2] + fromB[2] - intoA[2],
  ]
}

export interface VlmPanel {
  /** Bound vortex endpoints, inboard-to-outboard along the quarter chord */
  a: Vec3
  b: Vec3
  /** Where the flow-tangency condition is enforced */
  control: Vec3
  normal: Vec3
  /** Spanwise station of the panel centre (m) */
  y: number
  eta: number
  chord: number
  /** Spanwise projection of the bound vortex (m) */
  deltaY: number
  /** Wake position of the panel centre in the crossflow plane */
  wakeZ: number
}

export interface VlmLattice {
  panels: VlmPanel[]
  /** Trailing filament positions, one per panel edge: [y, z] */
  edges: { y: number; z: number }[]
  span: number
  area: number
  aspectRatio: number
}

/** One spanwise station, described independently of the parameter model. */
export interface LatticeStation {
  chord: number
  /** x of the quarter-chord point (m, positive aft) */
  quarterChordX: number
  /** z of the section (m, positive up) */
  z: number
  /** Incidence the surface is built at, camber included (radians) */
  incidence: number
  /** Dihedral rotation about the streamwise axis (radians, signed by side) */
  dihedral: number
}

/**
 * A surface described by distributions rather than by parameters - the same
 * trick the lifting-line solver uses, and for the same reason: it lets the
 * lattice be handed an elliptical planform, which is the one case theory pins
 * down exactly and therefore the only honest way to check the method.
 */
export interface LatticeGeometry {
  span: number
  area: number
  station: (y: number) => LatticeStation
}

/**
 * Lay out the lattice.
 *
 * Panel edges use cosine spacing so panels bunch up at the tips, where the load
 * gradient is steepest and a uniform lattice converges slowest.
 */
export function buildLattice(
  geometry: LatticeGeometry,
  panelCount = 60,
): VlmLattice {
  const halfSpan = geometry.span / 2

  const edgeY: number[] = []
  for (let i = 0; i <= panelCount; i++) {
    edgeY.push(-halfSpan * Math.cos((Math.PI * i) / panelCount))
  }

  const quarterChord = (y: number): Vec3 => {
    const at = geometry.station(y)
    return [at.quarterChordX, y, at.z]
  }

  const panels: VlmPanel[] = []
  const edges: { y: number; z: number }[] = edgeY.map((y) => ({
    y,
    z: geometry.station(y).z,
  }))

  for (let i = 0; i < panelCount; i++) {
    const a = quarterChord(edgeY[i])
    const b = quarterChord(edgeY[i + 1])
    const y = (edgeY[i] + edgeY[i + 1]) / 2
    const at = geometry.station(y)

    const sinI = Math.sin(at.incidence)
    const cosI = Math.cos(at.incidence)
    const sinG = Math.sin(at.dihedral)
    const cosG = Math.cos(at.dihedral)

    // Half a chord aft of the quarter chord is the three-quarter chord point.
    const along: Vec3 = [0.5 * at.chord * cosI, 0, -0.5 * at.chord * sinI]
    const root = quarterChord(y)
    const control: Vec3 = [
      root[0] + along[0],
      root[1] + along[1] * cosG - along[2] * sinG,
      root[2] + along[1] * sinG + along[2] * cosG,
    ]

    const flat: Vec3 = [sinI, 0, cosI]
    const normal: Vec3 = [
      flat[0],
      flat[1] * cosG - flat[2] * sinG,
      flat[1] * sinG + flat[2] * cosG,
    ]

    panels.push({
      a,
      b,
      control,
      normal,
      y,
      eta: y / halfSpan,
      chord: at.chord,
      deltaY: b[1] - a[1],
      wakeZ: at.z,
    })
  }

  return {
    panels,
    edges,
    span: geometry.span,
    area: geometry.area,
    aspectRatio: (geometry.span * geometry.span) / geometry.area,
  }
}

/** The studio's wing parameters, expressed as a lattice geometry. */
export function latticeGeometryFromWing(
  wing: WingParams,
  section: SectionProperties = sectionProperties(wing.naca),
): LatticeGeometry {
  const geometry = planform(wing)

  return {
    span: wing.span,
    area: geometry.area,
    station: (y) => ({
      chord: chordAt(wing, y),
      quarterChordX: quarterChordX(wing, y),
      z: dihedralZ(wing, y),
      // Twist, plus the camber expressed as the angle at which the section
      // makes no lift. The freestream supplies the rest of the incidence.
      incidence: twistAt(wing, y) * DEG - section.zeroLiftAlpha,
      // Dihedral tilts both tips up, so the sign follows which side we are on.
      dihedral: wing.dihedral * DEG * Math.sign(y || 1),
    }),
  }
}

/** A factorised lattice: everything that does not depend on incidence. */
export interface VlmSolution {
  lattice: VlmLattice
  /** Circulation from the shape alone, at zero incidence */
  fromShape: number[]
  /** Extra circulation per radian of incidence */
  perAlpha: number[]
}

function luDecompose(matrix: number[][]): { lu: number[][]; pivot: number[] } {
  const n = matrix.length
  const lu = matrix.map((row) => row.slice())
  const pivot = Array.from({ length: n }, (_, i) => i)

  for (let k = 0; k < n; k++) {
    let best = k
    let bestValue = Math.abs(lu[k][k])
    for (let i = k + 1; i < n; i++) {
      const value = Math.abs(lu[i][k])
      if (value > bestValue) {
        best = i
        bestValue = value
      }
    }

    if (best !== k) {
      const swap = lu[k]
      lu[k] = lu[best]
      lu[best] = swap
      const p = pivot[k]
      pivot[k] = pivot[best]
      pivot[best] = p
    }

    const diagonal = lu[k][k]
    if (diagonal === 0) continue

    for (let i = k + 1; i < n; i++) {
      const factor = (lu[i][k] /= diagonal)
      if (factor === 0) continue
      for (let j = k + 1; j < n; j++) {
        lu[i][j] -= factor * lu[k][j]
      }
    }
  }

  return { lu, pivot }
}

function luSolve(lu: number[][], pivot: number[], rhs: number[]): number[] {
  const n = lu.length
  const x = new Array<number>(n)

  for (let i = 0; i < n; i++) {
    let sum = rhs[pivot[i]]
    for (let j = 0; j < i; j++) sum -= lu[i][j] * x[j]
    x[i] = sum
  }

  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i]
    for (let j = i + 1; j < n; j++) sum -= lu[i][j] * x[j]
    x[i] = lu[i][i] === 0 ? 0 : sum / lu[i][i]
  }

  return x
}

export function factorLattice(lattice: VlmLattice): VlmSolution {
  const { panels } = lattice
  const n = panels.length

  const matrix: number[][] = []
  const rhsShape: number[] = []
  const rhsAlpha: number[] = []

  for (let i = 0; i < n; i++) {
    const panel = panels[i]
    const row = new Array<number>(n)

    for (let j = 0; j < n; j++) {
      const v = horseshoeVelocity(panel.control, panels[j].a, panels[j].b)
      row[j] = dot(v, panel.normal)
    }

    matrix.push(row)
    // Freestream (1, 0, alpha) dotted with the normal, moved to the other side.
    rhsShape.push(-panel.normal[0])
    rhsAlpha.push(-panel.normal[2])
  }

  const { lu, pivot } = luDecompose(matrix)

  return {
    lattice,
    fromShape: luSolve(lu, pivot, rhsShape),
    perAlpha: luSolve(lu, pivot, rhsAlpha),
  }
}

/**
 * Induced drag, taken in the Trefftz plane.
 *
 * Far downstream the wake is a two-dimensional problem: the trailing filaments
 * become point vortices in the crossflow plane, and their downwash over the
 * span is what the induced drag integrates. Reading the drag here rather than
 * at the wing avoids the near-field cancellation that makes a lattice noisy.
 */
function trefftzInducedDrag(
  lattice: VlmLattice,
  circulation: number[],
): number {
  const { panels, edges } = lattice
  const n = panels.length

  // Net trailing strength shed at each panel edge.
  const shed = new Array<number>(n + 1)
  for (let k = 0; k <= n; k++) {
    const inboard = k > 0 ? circulation[k - 1] : 0
    const outboard = k < n ? circulation[k] : 0
    shed[k] = inboard - outboard
  }

  let drag = 0
  for (let i = 0; i < n; i++) {
    let w = 0
    for (let k = 0; k <= n; k++) {
      const dy = panels[i].y - edges[k].y
      const dz = panels[i].wakeZ - edges[k].z
      const rSquared = dy * dy + dz * dz
      if (rSquared < EPSILON) continue
      w += (shed[k] / TWO_PI) * (dy / rSquared)
    }
    drag -= circulation[i] * w * panels[i].deltaY
  }

  return drag / lattice.area
}

/**
 * Evaluate a factorised lattice at one incidence, in the same shape the
 * lifting-line solver returns - so every consumer downstream is unchanged.
 */
export function vlmAtAlpha(solution: VlmSolution, alpha: number): LiftingLineResult {
  const { lattice, fromShape, perAlpha } = solution
  const { panels, area, aspectRatio } = lattice
  const n = panels.length

  const alphaRad = alpha * DEG
  const circulation = fromShape.map((g, i) => g + alphaRad * perAlpha[i])

  const liftOf = (gamma: number[]) => {
    let sum = 0
    for (let i = 0; i < n; i++) sum += gamma[i] * panels[i].deltaY
    return (2 * sum) / area
  }

  const cl = liftOf(circulation)
  const clAlpha = liftOf(perAlpha)
  const clAtZero = liftOf(fromShape)

  const cdi = trefftzInducedDrag(lattice, circulation)

  // Span efficiency is defined by the drag the lattice actually produced,
  // rather than assumed and then used to produce it.
  const ideal = (cl * cl) / (Math.PI * aspectRatio)
  const spanEfficiency = cdi > 1e-12 && Math.abs(cl) > 1e-9 ? ideal / cdi : 1
  const delta = spanEfficiency > 0 ? 1 / spanEfficiency - 1 : 0

  const rootIndex = Math.round((n - 1) / 2)
  const rootGamma = circulation[rootIndex]

  const stations: SpanStation[] = panels.map((panel, i) => ({
    y: panel.y,
    eta: panel.eta,
    chord: panel.chord,
    gamma: circulation[i],
    cl: (2 * circulation[i]) / panel.chord,
    load: Math.abs(rootGamma) > 1e-12 ? circulation[i] / rootGamma : 0,
    elliptical: Math.sqrt(Math.max(0, 1 - panel.eta * panel.eta)),
  }))

  return {
    cl,
    clAlpha,
    cdi,
    spanEfficiency,
    delta,
    zeroLiftAlpha: Math.abs(clAlpha) > 1e-12 ? -clAtZero / clAlpha / DEG : 0,
    coefficients: circulation,
    stations,
    aspectRatio,
  }
}

/** Factor a wing for the vortex-lattice solver. */
export function factorWingVlm(wing: WingParams, panelCount = 60): VlmSolution {
  return factorLattice(buildLattice(latticeGeometryFromWing(wing), panelCount))
}

/** Leading-edge position is needed by the lattice tests and the scene alike. */
export { leadingEdgeX }
