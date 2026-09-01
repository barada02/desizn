/**
 * The parameter contract for the whole studio.
 *
 * This module is the single source of truth for what can be changed, what it
 * means and how far it can go. The slider panel is generated from the bounds
 * below, the solver reads the same shape, and the agent tool schema will be
 * derived from it too - so a control, a test and a tool can never drift apart.
 *
 * Units are SI throughout (metres, kilograms, seconds) with one deliberate
 * exception: angles are stored in DEGREES because that is what a person types
 * and reads. Every solver converts to radians at its own boundary.
 */

/** Wing shape. Everything here changes the geometry you see. */
export interface WingParams {
  /** b - full wingspan, tip to tip (m) */
  span: number
  /** c_r - chord at the centreline (m) */
  rootChord: number
  /** lambda - tip chord divided by root chord */
  taper: number
  /** Lambda - quarter-chord sweep (deg) */
  sweepQuarter: number
  /** epsilon - tip twist relative to root; negative is washout (deg) */
  twist: number
  /** Gamma - dihedral angle (deg) */
  dihedral: number
  /** NACA 4-digit section code, e.g. "2412" */
  naca: string
}

/** Flight condition. These change the numbers, not the shape. */
export interface OperatingParams {
  /** alpha - root angle of attack (deg) */
  alpha: number
  /** V - true airspeed (m/s) */
  speed: number
  /** h - altitude, which sets density and viscosity through the ISA (m) */
  altitude: number
  /** m - aircraft mass, for wing loading and stall speed (kg) */
  mass: number
}

/**
 * The full design. Today it is a wing and a flight condition; tail, fuselage
 * and propulsion become sibling keys here rather than a rewrite.
 */
export interface AircraftParams {
  wing: WingParams
  operating: OperatingParams
}

/** Everything a slider - or an agent - needs to know about one number. */
export interface ParamBound {
  label: string
  /** Symbol as it appears in the equations, for the readouts */
  symbol: string
  /** SI unit, or "" for a dimensionless ratio */
  unit: string
  min: number
  max: number
  step: number
  /** One plain sentence on what moving this actually does */
  help: string
}

export type NumericWingKey = Exclude<keyof WingParams, 'naca'>

export const WING_BOUNDS: Record<NumericWingKey, ParamBound> = {
  span: {
    label: 'Span',
    symbol: 'b',
    unit: 'm',
    min: 4,
    max: 30,
    step: 0.1,
    help: 'Tip to tip. Stretching the span at fixed area raises aspect ratio, which is the strongest lever on induced drag.',
  },
  rootChord: {
    label: 'Root chord',
    symbol: 'c_r',
    unit: 'm',
    min: 0.3,
    max: 4,
    step: 0.01,
    help: 'Chord at the centreline. With span fixed, a bigger root chord means more area and a lower aspect ratio.',
  },
  taper: {
    label: 'Taper ratio',
    symbol: 'lambda',
    unit: '',
    min: 0.2,
    max: 1,
    step: 0.01,
    help: 'Tip chord over root chord. Around 0.35 to 0.45 the load comes closest to elliptical on an unswept wing.',
  },
  sweepQuarter: {
    label: 'Sweep',
    symbol: 'Lambda',
    unit: 'deg',
    min: -10,
    max: 45,
    step: 0.5,
    help: 'Quarter-chord sweep. It reshapes the wing now; it will change the aerodynamics once the vortex-lattice solver lands.',
  },
  twist: {
    label: 'Twist',
    symbol: 'epsilon',
    unit: 'deg',
    min: -8,
    max: 4,
    step: 0.1,
    help: 'Tip incidence relative to the root. Negative is washout, which unloads the tip and keeps the stall away from the ailerons.',
  },
  dihedral: {
    label: 'Dihedral',
    symbol: 'Gamma',
    unit: 'deg',
    min: -5,
    max: 12,
    step: 0.5,
    help: 'Upward angle of the wing from root to tip. It buys roll stability and, for now, changes the shape only.',
  },
}

export const OPERATING_BOUNDS: Record<keyof OperatingParams, ParamBound> = {
  alpha: {
    label: 'Angle of attack',
    symbol: 'alpha',
    unit: 'deg',
    min: -6,
    max: 16,
    step: 0.1,
    help: 'Angle between the root chord and the oncoming air. Lift grows with it, until the wing stalls.',
  },
  speed: {
    label: 'Airspeed',
    symbol: 'V',
    unit: 'm/s',
    min: 10,
    max: 120,
    step: 1,
    help: 'True airspeed. It sets dynamic pressure and Reynolds number, so it moves drag without touching the shape.',
  },
  altitude: {
    label: 'Altitude',
    symbol: 'h',
    unit: 'm',
    min: 0,
    max: 12000,
    step: 100,
    help: 'Thinner air aloft means less density: same shape, less lift and less drag at the same speed.',
  },
  mass: {
    label: 'Mass',
    symbol: 'm',
    unit: 'kg',
    min: 200,
    max: 5000,
    step: 10,
    help: 'All-up mass. It sets the lift the wing has to make, and with it the stall speed.',
  },
}

export const DEFAULT_PARAMS: AircraftParams = {
  wing: {
    span: 10,
    rootChord: 1.4,
    taper: 0.45,
    sweepQuarter: 3,
    twist: -2,
    dihedral: 4,
    naca: '2412',
  },
  operating: {
    alpha: 4,
    speed: 45,
    altitude: 0,
    mass: 900,
  },
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Hold a value inside its declared bound. */
export function clampToBound(value: number, bound: ParamBound): number {
  return clamp(value, bound.min, bound.max)
}

/**
 * A NACA 4-digit code is valid when it is four digits and describes a section
 * with real thickness. "0000" is a line, not an airfoil.
 */
export function isValidNaca(code: string): boolean {
  if (!/^\d{4}$/.test(code)) return false
  const thickness = Number(code.slice(2))
  if (thickness <= 0) return false
  const camber = Number(code[0])
  const camberPos = Number(code[1])
  // Camber needs somewhere to peak, and a peak needs camber to be meaningful.
  if (camber > 0 && camberPos === 0) return false
  if (camber === 0 && camberPos > 0) return false
  return true
}

export const DEG = Math.PI / 180
