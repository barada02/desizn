/**
 * Planform geometry for a straight-tapered wing.
 *
 * Everything here is closed-form: these are the quantities the solver, the 3D
 * loft and the stability calculation all need to agree on, so they are derived
 * once, in one place.
 *
 * Spanwise station y is measured from the centreline, positive to starboard,
 * so y runs over [-b/2, +b/2].
 */

import { DEG, type WingParams } from './params'

export interface Planform {
  /** S - reference area (m^2) */
  area: number
  /** AR = b^2 / S */
  aspectRatio: number
  /** Mean aerodynamic chord (m) */
  mac: number
  /** Spanwise station of the MAC, from the centreline (m) */
  yMac: number
  /** c_t - tip chord (m) */
  tipChord: number
  /** b/2 (m) */
  halfSpan: number
  /** Leading-edge sweep (deg) */
  sweepLeadingEdge: number
  /** Wetted area, both surfaces, with a thickness allowance (m^2) */
  wettedArea: number
}

/** Local chord at spanwise station y. */
export function chordAt(wing: WingParams, y: number): number {
  const halfSpan = wing.span / 2
  const eta = Math.min(1, Math.abs(y) / halfSpan)
  return wing.rootChord * (1 - (1 - wing.taper) * eta)
}

/** Local geometric twist at y: zero at the root, `wing.twist` at the tip (deg). */
export function twistAt(wing: WingParams, y: number): number {
  const halfSpan = wing.span / 2
  const eta = Math.min(1, Math.abs(y) / halfSpan)
  return wing.twist * eta
}

/** x of the local quarter-chord point, measured aft from the root quarter-chord (m). */
export function quarterChordX(wing: WingParams, y: number): number {
  return Math.abs(y) * Math.tan(wing.sweepQuarter * DEG)
}

/** x of the local leading edge, measured aft from the root quarter-chord (m). */
export function leadingEdgeX(wing: WingParams, y: number): number {
  return quarterChordX(wing, y) - 0.25 * chordAt(wing, y)
}

/** z of the local section, from dihedral (m). */
export function dihedralZ(wing: WingParams, y: number): number {
  return Math.abs(y) * Math.tan(wing.dihedral * DEG)
}

/** Maximum thickness-to-chord ratio read off the NACA 4-digit code. */
export function thicknessRatio(naca: string): number {
  return Number(naca.slice(2)) / 100
}

export function planform(wing: WingParams): Planform {
  const { span, rootChord, taper } = wing
  const halfSpan = span / 2

  const area = halfSpan * rootChord * (1 + taper)
  const aspectRatio = (span * span) / area
  const mac = (2 / 3) * rootChord * ((1 + taper + taper * taper) / (1 + taper))
  const yMac = (span / 6) * ((1 + 2 * taper) / (1 + taper))

  // Sweep of any chord line follows from the quarter-chord sweep and the taper:
  //   tan(Lambda_n) = tan(Lambda_m) - (4/AR)((n-m)/100)(1-lambda)/(1+lambda)
  // Going from the quarter chord (m = 25) to the leading edge (n = 0):
  const tanLe =
    Math.tan(wing.sweepQuarter * DEG) + ((1 - taper) / (1 + taper)) / aspectRatio

  // Both sides of a thin surface, plus an allowance for the thickness bulge.
  const wettedArea = 2 * area * (1 + 0.2 * thicknessRatio(wing.naca))

  return {
    area,
    aspectRatio,
    mac,
    yMac,
    tipChord: rootChord * taper,
    halfSpan,
    sweepLeadingEdge: Math.atan(tanLe) / DEG,
    wettedArea,
  }
}

/** Wing loading, W/S in N/m^2. */
export function wingLoading(mass: number, area: number): number {
  return (mass * 9.80665) / area
}
