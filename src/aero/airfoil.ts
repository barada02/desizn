/**
 * NACA 4-digit sections, generated from the code rather than tabulated.
 *
 * The four digits are read as: maximum camber (% chord), position of that
 * camber (tenths of chord), and maximum thickness (% chord). So "2412" is 2%
 * camber at 40% chord on a 12% thick section.
 *
 * All x and z are fractions of chord, measured from the leading edge.
 */

export interface NacaSection {
  /** m - maximum camber, fraction of chord */
  camber: number
  /** p - chordwise position of maximum camber, fraction of chord */
  camberPos: number
  /** t - maximum thickness, fraction of chord */
  thickness: number
  /** The originating 4-digit code */
  code: string
}

export interface Point2 {
  x: number
  z: number
}

/** Section lift-curve slope from thin airfoil theory, per radian. */
export const SECTION_LIFT_SLOPE = 2 * Math.PI

export function parseNaca(code: string): NacaSection {
  return {
    camber: Number(code[0]) / 100,
    camberPos: Number(code[1]) / 10,
    thickness: Number(code.slice(2)) / 100,
    code,
  }
}

/** Mean camber line z_c(x). */
export function camberLine(x: number, s: NacaSection): number {
  const { camber: m, camberPos: p } = s
  if (m === 0 || p === 0) return 0

  return x <= p
    ? (m / (p * p)) * (2 * p * x - x * x)
    : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x)
}

/** Slope of the mean camber line, dz_c/dx. */
export function camberSlope(x: number, s: NacaSection): number {
  const { camber: m, camberPos: p } = s
  if (m === 0 || p === 0) return 0

  return x <= p
    ? ((2 * m) / (p * p)) * (p - x)
    : ((2 * m) / ((1 - p) * (1 - p))) * (p - x)
}

/**
 * Half-thickness y_t(x), so the full section thickness is twice this.
 *
 * The last coefficient is -0.1036 rather than the original -0.1015, which
 * closes the trailing edge. An open trailing edge leaves a gap the 3D loft
 * would have to patch, and costs nothing aerodynamically here.
 */
export function halfThicknessAt(x: number, s: NacaSection): number {
  const xc = Math.max(0, Math.min(1, x))
  return (
    (s.thickness / 0.2) *
    (0.2969 * Math.sqrt(xc) -
      0.126 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1036 * xc * xc * xc * xc)
  )
}

/**
 * Zero-lift angle of attack from thin airfoil theory (radians):
 *
 *   alpha_L0 = -(1/pi) * integral over theta of (dz/dx)(cos(theta) - 1)
 *
 * with x = (1 - cos(theta)) / 2. Integrated numerically with Simpson's rule,
 * which converges quickly because the integrand is smooth in theta even though
 * dz/dx has a kink at the camber position.
 */
export function zeroLiftAlpha(s: NacaSection, intervals = 400): number {
  if (s.camber === 0 || s.camberPos === 0) return 0

  const n = intervals % 2 === 0 ? intervals : intervals + 1
  const h = Math.PI / n

  const f = (theta: number): number => {
    const x = (1 - Math.cos(theta)) / 2
    return camberSlope(x, s) * (Math.cos(theta) - 1)
  }

  let sum = f(0) + f(Math.PI)
  for (let i = 1; i < n; i++) {
    sum += f(i * h) * (i % 2 === 0 ? 2 : 4)
  }

  return -((sum * h) / 3) / Math.PI
}

/**
 * Estimated maximum section lift coefficient.
 *
 * Thin airfoil theory says nothing about stall, so this is an empirical fit
 * rather than a derivation: camber raises the peak, and sections far from about
 * 13% thickness lose some of it - very thin ones to a sharp leading-edge stall,
 * very thick ones to early separation.
 *
 * It reproduces the published values closely enough to be useful:
 * 0012 -> 1.45, 2412 -> 1.61, 4412 -> 1.77, against roughly 1.45, 1.6 and 1.75
 * measured near Re 3e6.
 */
export function sectionClMax(s: NacaSection): number {
  const thicknessFactor = Math.max(
    0.7,
    1 - 25 * (s.thickness - 0.13) * (s.thickness - 0.13),
  )
  return (1.45 + 8 * s.camber) * thicknessFactor
}

/** Everything the lifting-line solver needs to know about the section. */
export interface SectionProperties {
  /** a_0, per radian */
  liftSlope: number
  /** alpha_L0, radians */
  zeroLiftAlpha: number
  /** t/c */
  thicknessRatio: number
  /** Estimated section stall, where linear theory stops being trustworthy */
  clMax: number
}

export function sectionProperties(code: string): SectionProperties {
  const s = parseNaca(code)
  return {
    liftSlope: SECTION_LIFT_SLOPE,
    zeroLiftAlpha: zeroLiftAlpha(s),
    thicknessRatio: s.thickness,
    clMax: sectionClMax(s),
  }
}

/**
 * Closed section contour, ordered from the trailing edge forward over the
 * upper surface to the leading edge, then aft along the lower surface.
 *
 * Points are unique - the trailing edge appears once, at index 0 - so the
 * consumer closes the loop by wrapping the last index back to the first. That
 * is what the 3D loft wants: no degenerate quad at the seam.
 *
 * Chordwise stations use cosine spacing, which clusters points at the leading
 * edge where the curvature actually is.
 *
 * @param stations number of chordwise stations from leading to trailing edge
 * @returns 2 * stations - 2 points
 */
export function airfoilCoordinates(s: NacaSection, stations = 60): Point2[] {
  const xs: number[] = []
  for (let i = 0; i < stations; i++) {
    const beta = (Math.PI * i) / (stations - 1)
    xs.push((1 - Math.cos(beta)) / 2)
  }

  const upper: Point2[] = []
  const lower: Point2[] = []

  for (const x of xs) {
    const yt = halfThicknessAt(x, s)
    const zc = camberLine(x, s)
    const theta = Math.atan(camberSlope(x, s))
    const sin = Math.sin(theta)
    const cos = Math.cos(theta)

    upper.push({ x: x - yt * sin, z: zc + yt * cos })
    lower.push({ x: x + yt * sin, z: zc - yt * cos })
  }

  // Trailing edge -> leading edge over the top, then back along the bottom.
  // The leading edge is shared, and the trailing edge is not repeated.
  const contour = upper.reverse()
  contour.push(...lower.slice(1, -1))

  return contour
}
