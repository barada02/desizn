/**
 * The briefs you can design against.
 *
 * Each one is a small set of requirements that genuinely fight each other. A
 * trainer wants a low stall speed and a short span, and those pull opposite
 * ways. A glider wants an enormous lift-to-drag ratio, which wants span, which
 * the hangar limit will not give you for free. Finding the compromise is the
 * exercise.
 *
 * Every brief here has been checked to be satisfiable - the tests carry a
 * worked example for each, so none of them is an impossible target.
 */

import type { Brief, Requirement } from './requirements'

const carry = (kilograms: number): Requirement => ({
  id: 'payload',
  label: 'All-up mass',
  detail:
    'The aircraft has to actually carry this. Lightening it to make the other numbers work is not a solution.',
  unit: 'kg',
  measure: (d) => d.params.operating.mass,
  min: kilograms,
})

const stallBelow = (speed: number): Requirement => ({
  id: 'stall',
  label: 'Stall speed',
  detail:
    'How slowly it can still fly. This sets approach speed, and with it how much runway and how survivable a bad landing is.',
  unit: 'm/s',
  measure: (d) => d.results.envelope.stallSpeed,
  max: speed,
  decimals: 1,
})

const glideAtLeast = (ratio: number): Requirement => ({
  id: 'best-ld',
  label: 'Best lift / drag',
  detail:
    'The best this shape can manage at any angle. It sets range, glide distance and how much engine you need.',
  unit: '',
  measure: (d) => d.polar.bestLiftToDrag.liftToDrag,
  min: ratio,
  decimals: 1,
})

const spanUnder = (metres: number): Requirement => ({
  id: 'span',
  label: 'Wingspan',
  detail: 'What has to fit in the hangar, and what the spar has to carry.',
  unit: 'm',
  measure: (d) => d.params.wing.span,
  max: metres,
  decimals: 1,
})

const stableBetween = (low: number, high: number): Requirement => ({
  id: 'static-margin',
  label: 'Static margin',
  detail:
    'How firmly it holds its pitch attitude. Too little and it is twitchy or divergent; too much and it fights every input.',
  unit: '%',
  measure: (d) => d.results.stability.staticMargin * 100,
  min: low,
  max: high,
  decimals: 1,
})

const cruiseAtLeast = (speed: number): Requirement => ({
  id: 'cruise',
  label: 'Cruise speed',
  detail: 'It has to be flown this fast, and still meet everything else here.',
  unit: 'm/s',
  measure: (d) => d.params.operating.speed,
  min: speed,
})

const wingLoadingUnder = (loading: number): Requirement => ({
  id: 'wing-loading',
  label: 'Wing loading',
  detail:
    'Weight spread over wing area. Low wing loading means short fields and a soft ride in turbulence; high means a smooth ride fast.',
  unit: 'N/m²',
  measure: (d) => d.results.wingLoading,
  max: loading,
})

const noTipStall: Requirement = {
  id: 'tip-stall',
  label: 'Stall origin',
  detail:
    'Where the wing lets go first, as a fraction of semi-span. Out past 0.7 the stall starts at the ailerons and takes roll control with it.',
  unit: '',
  measure: (d) => Math.abs(d.results.envelope.criticalEta),
  max: 0.7,
  decimals: 2,
}

export const BRIEFS: Brief[] = [
  {
    id: 'free',
    name: 'Free play',
    summary: 'No requirements. Move anything and watch what happens.',
    requirements: [],
  },
  {
    id: 'trainer',
    name: 'Club trainer',
    summary:
      'Two seats, forgiving, and it has to fit in an ordinary hangar. The stall speed and the span limit are the fight.',
    requirements: [
      carry(750),
      stallBelow(26),
      glideAtLeast(20),
      stableBetween(8, 20),
      spanUnder(11),
      noTipStall,
    ],
  },
  {
    id: 'glider',
    name: 'Cross-country glider',
    summary:
      'Everything is subordinate to glide ratio, but the span you want is not the span you are allowed.',
    requirements: [
      carry(400),
      glideAtLeast(30),
      stallBelow(21),
      spanUnder(18),
      stableBetween(5, 18),
    ],
  },
  {
    id: 'stol',
    name: 'Short-field utility',
    summary:
      'Get into a rough strip with a useful load. Wing loading and stall speed drive everything.',
    requirements: [
      carry(1100),
      stallBelow(21),
      wingLoadingUnder(700),
      stableBetween(10, 25),
      noTipStall,
    ],
  },
  {
    id: 'racer',
    name: 'Sport racer',
    summary:
      'Small, fast and still controllable. A short span is the point, not a constraint you would like to escape.',
    requirements: [
      carry(600),
      cruiseAtLeast(80),
      glideAtLeast(16),
      spanUnder(8),
      stableBetween(5, 15),
    ],
  },
]

export const DEFAULT_BRIEF = 'free'

export function briefById(id: string): Brief {
  return BRIEFS.find((brief) => brief.id === id) ?? BRIEFS[0]
}
