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

/**
 * Horizontal tail. It is a lifting surface like any other, so it reuses the
 * same planform and lifting-line machinery as the wing rather than getting its
 * own approximations - the two extra numbers are where it sits and how it is
 * rigged.
 */
export interface TailParams {
  /** Full tailplane span (m) */
  span: number
  /** Chord at the tail centreline (m) */
  rootChord: number
  /** Tip chord divided by root chord */
  taper: number
  /** Distance from the wing quarter-chord to the tail quarter-chord (m) */
  arm: number
  /** Rigging angle relative to the wing root chord; usually negative (deg) */
  incidence: number
  /** NACA 4-digit section, normally symmetric */
  naca: string
}

/** Where the mass sits. */
export interface BalanceParams {
  /** Centre of gravity, as a fraction of MAC aft of the MAC leading edge */
  cg: number
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
  tail: TailParams
  balance: BalanceParams
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
    help: 'Tip chord over root chord. With no twist the load is closest to elliptical near 0.4 - but washout shifts that optimum toward a squarer wing, so set the two together.',
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
    help: 'Tip incidence relative to the root. Negative is washout: it unloads the tip so the stall starts inboard, away from the ailerons - and it costs span efficiency, which is the trade you are making.',
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

export type NumericTailKey = Exclude<keyof TailParams, 'naca'>

export const TAIL_BOUNDS: Record<NumericTailKey, ParamBound> = {
  span: {
    label: 'Tail span',
    symbol: 'b_t',
    unit: 'm',
    min: 1,
    max: 12,
    step: 0.05,
    help: 'A bigger tailplane has more leverage over pitch, which pushes the neutral point aft and makes the aircraft more stable.',
  },
  rootChord: {
    label: 'Tail chord',
    symbol: 'c_t',
    unit: 'm',
    min: 0.2,
    max: 2,
    step: 0.01,
    help: 'Tail area works the same way span does, but without the aspect ratio benefit - span is the more efficient way to buy stability.',
  },
  taper: {
    label: 'Tail taper',
    symbol: 'lambda_t',
    unit: '',
    min: 0.3,
    max: 1,
    step: 0.01,
    help: 'Tip chord over root chord for the tailplane. It barely moves stability; it is mostly structure and weight.',
  },
  arm: {
    label: 'Tail arm',
    symbol: 'l_t',
    unit: 'm',
    min: 1,
    max: 12,
    step: 0.05,
    help: 'How far behind the wing the tail sits. The cheapest stability there is - leverage costs nothing but a longer fuselage.',
  },
  incidence: {
    label: 'Tail incidence',
    symbol: 'i_t',
    unit: 'deg',
    min: -6,
    max: 3,
    step: 0.1,
    help: 'How the tailplane is rigged relative to the wing. It sets what the aircraft trims at, not how stable it is.',
  },
}

export const BALANCE_BOUNDS: Record<keyof BalanceParams, ParamBound> = {
  cg: {
    label: 'Centre of gravity',
    symbol: 'x_cg',
    unit: 'MAC',
    min: 0.1,
    max: 0.7,
    step: 0.005,
    help: 'Where the mass balances, measured back from the leading edge of the mean chord. Everything about pitch stability follows from how far this sits ahead of the neutral point.',
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
  // Roughly a 0.7 tail volume coefficient, which is ordinary for a light
  // aircraft, with the CG set to leave a healthy static margin.
  tail: {
    span: 3,
    rootChord: 0.7,
    taper: 0.8,
    arm: 4,
    incidence: -1.5,
    naca: '0009',
  },
  balance: {
    cg: 0.45,
  },
  // Chosen so the starting design actually flies: at 55 m/s this wing trims
  // within a tenth of a degree of its default incidence, so the app opens on a
  // working aeroplane rather than on a warning.
  operating: {
    alpha: 4,
    speed: 55,
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
