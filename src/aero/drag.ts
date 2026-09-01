/**
 * Profile drag, estimated the way a preliminary design actually estimates it:
 * a flat plate of the same wetted area, corrected for the fact that the wing is
 * a thick body rather than a plate.
 *
 * This is a component buildup, so a tail, a fuselage and a nacelle each add
 * their own term later without any of this changing.
 */

/**
 * Turbulent flat-plate skin friction, the Prandtl-Schlichting correlation:
 *
 *   C_f = 0.455 / (log10 Re)^2.58
 *
 * Fully turbulent is the honest assumption for a real, slightly rough wing at
 * a few million Reynolds; assuming laminar flow would flatter the design.
 */
export function skinFrictionCoefficient(reynolds: number): number {
  const re = Math.max(1e4, reynolds)
  return 0.455 / Math.log10(re) ** 2.58
}

/**
 * Form factor: how much more drag a section of this thickness makes than a
 * plate of the same wetted area, from thickening of the boundary layer and the
 * pressure drag that comes with it.
 */
export function formFactor(thicknessRatio: number): number {
  const t = thicknessRatio
  return 1 + 2 * t + 100 * t ** 4
}

export interface DragBuildup {
  /** Reynolds number on the mean aerodynamic chord */
  reynolds: number
  /** Flat-plate skin friction coefficient */
  skinFriction: number
  /** Thickness correction */
  formFactor: number
  /** Profile drag coefficient, on wing reference area */
  cd0: number
  /** Induced drag coefficient */
  cdi: number
  /** Total drag coefficient */
  cd: number
}

export interface DragInput {
  reynolds: number
  thicknessRatio: number
  /** Wetted area, both surfaces (m^2) */
  wettedArea: number
  /** Reference area (m^2) */
  referenceArea: number
  /** Induced drag coefficient from the lifting-line solve */
  cdi: number
}

export function dragBuildup(input: DragInput): DragBuildup {
  const skinFriction = skinFrictionCoefficient(input.reynolds)
  const ff = formFactor(input.thicknessRatio)
  const cd0 = (skinFriction * ff * input.wettedArea) / input.referenceArea

  return {
    reynolds: input.reynolds,
    skinFriction,
    formFactor: ff,
    cd0,
    cdi: input.cdi,
    cd: cd0 + input.cdi,
  }
}
