/**
 * Design briefs.
 *
 * A slider without a target is just a slider. Real design starts from
 * requirements - carry this much, stall no faster than that, fit in the hangar -
 * and the work is finding a shape that satisfies all of them at once, which is
 * usually not possible without giving something up.
 *
 * Every requirement is checked against the design as it currently stands,
 * including its flight condition. That is deliberate: it means you cannot meet
 * a stall-speed requirement by quietly emptying the aeroplane, because carrying
 * the payload is a requirement too.
 */

import type { DesignSnapshot } from './snapshot'

export interface Requirement {
  id: string
  label: string
  /** What this is really asking for, in a sentence */
  detail: string
  unit: string
  /** Read the measured value out of a design */
  measure: (design: DesignSnapshot) => number
  /** Lower bound, if there is one */
  min?: number
  /** Upper bound, if there is one */
  max?: number
  decimals?: number
}

export interface Brief {
  id: string
  name: string
  summary: string
  requirements: Requirement[]
}

export interface RequirementCheck {
  requirement: Requirement
  value: number
  passes: boolean
  /**
   * How much room is left, as a fraction of the span of the allowed range.
   * Negative when the requirement is missed, so the size of a failure is
   * legible and not just its existence.
   */
  slack: number
  /** Which way the value has to move to pass, when it does not */
  direction: 'lower' | 'higher' | null
}

export interface BriefCheck {
  brief: Brief
  checks: RequirementCheck[]
  met: number
  total: number
  allMet: boolean
}

function checkOne(
  requirement: Requirement,
  design: DesignSnapshot,
): RequirementCheck {
  const value = requirement.measure(design)
  const { min, max } = requirement

  const belowMin = min !== undefined && value < min
  const aboveMax = max !== undefined && value > max
  const passes = !belowMin && !aboveMax

  // Scale slack by whatever the requirement is measured in, so a percentage and
  // a metre are comparable when the panel sorts or colours them.
  const scale =
    min !== undefined && max !== undefined
      ? Math.abs(max - min)
      : Math.abs(min ?? max ?? 1) || 1

  let slack: number
  if (belowMin) slack = (value - min) / scale
  else if (aboveMax) slack = (max - value) / scale
  else if (min !== undefined && max !== undefined) {
    slack = Math.min(value - min, max - value) / scale
  } else if (min !== undefined) slack = (value - min) / scale
  else if (max !== undefined) slack = (max - value) / scale
  else slack = 0

  return {
    requirement,
    value,
    passes,
    slack,
    direction: belowMin ? 'higher' : aboveMax ? 'lower' : null,
  }
}

export function checkBrief(brief: Brief, design: DesignSnapshot): BriefCheck {
  const checks = brief.requirements.map((requirement) => checkOne(requirement, design))
  const met = checks.filter((check) => check.passes).length

  return {
    brief,
    checks,
    met,
    total: checks.length,
    allMet: met === checks.length,
  }
}

/** How a requirement's limits read on screen. */
export function describeLimits(requirement: Requirement): string {
  const decimals = requirement.decimals ?? 0
  const { min, max, unit } = requirement
  const suffix = unit ? ` ${unit}` : ''

  if (min !== undefined && max !== undefined) {
    return `${min.toFixed(decimals)} to ${max.toFixed(decimals)}${suffix}`
  }
  if (min !== undefined) return `at least ${min.toFixed(decimals)}${suffix}`
  if (max !== undefined) return `at most ${max.toFixed(decimals)}${suffix}`
  return 'unconstrained'
}
