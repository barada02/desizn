/**
 * International Standard Atmosphere, sea level to 20 km.
 *
 * Two layers cover the range the studio allows: a troposphere with a constant
 * lapse rate up to 11 km, then an isothermal lower stratosphere above it.
 */

const T0 = 288.15 // sea level temperature, K
const P0 = 101325 // sea level pressure, Pa
const LAPSE = 0.0065 // K/m
const R = 287.0528 // specific gas constant for dry air, J/(kg K)
const G = 9.80665 // m/s^2
const GAMMA = 1.4 // ratio of specific heats

const TROPOPAUSE_ALT = 11000 // m
const TROPOPAUSE_T = T0 - LAPSE * TROPOPAUSE_ALT // 216.65 K
const TROPOPAUSE_P = P0 * (TROPOPAUSE_T / T0) ** (G / (LAPSE * R))

export interface Atmosphere {
  /** K */
  temperature: number
  /** Pa */
  pressure: number
  /** kg/m^3 */
  density: number
  /** dynamic viscosity, Pa s */
  viscosity: number
  /** speed of sound, m/s */
  soundSpeed: number
}

/** Sutherland's law for the dynamic viscosity of air. */
function sutherland(temperature: number): number {
  return (1.458e-6 * temperature ** 1.5) / (temperature + 110.4)
}

export function atmosphere(altitude: number): Atmosphere {
  const h = Math.max(0, altitude)

  let temperature: number
  let pressure: number

  if (h <= TROPOPAUSE_ALT) {
    temperature = T0 - LAPSE * h
    pressure = P0 * (temperature / T0) ** (G / (LAPSE * R))
  } else {
    temperature = TROPOPAUSE_T
    pressure = TROPOPAUSE_P * Math.exp((-G * (h - TROPOPAUSE_ALT)) / (R * TROPOPAUSE_T))
  }

  return {
    temperature,
    pressure,
    density: pressure / (R * temperature),
    viscosity: sutherland(temperature),
    soundSpeed: Math.sqrt(GAMMA * R * temperature),
  }
}

/** q = 1/2 rho V^2, the pressure that scales every aerodynamic force. */
export function dynamicPressure(density: number, speed: number): number {
  return 0.5 * density * speed * speed
}

/** Re = rho V L / mu, on whatever reference length the caller cares about. */
export function reynolds(air: Atmosphere, speed: number, length: number): number {
  return (air.density * speed * length) / air.viscosity
}
