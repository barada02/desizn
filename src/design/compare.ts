/**
 * Comparing two designs.
 *
 * Without this the studio has a hole in the middle of it: you change taper, the
 * old numbers vanish, and the only way to know whether you helped is to have
 * memorised them. Pinning a design keeps it on screen so every subsequent move
 * is measured against something.
 *
 * Which way is "better" is stated per metric, and left blank where there is no
 * honest answer. A bigger span is not better or worse; it is a choice. Static
 * margin has a comfortable band rather than a direction. Saying so is more
 * useful than colouring everything green and red.
 */

import type { DesignSnapshot } from './snapshot'

export type Direction = 'higher' | 'lower' | null

export interface Metric {
  id: string
  label: string
  unit: string
  decimals: number
  read: (design: DesignSnapshot) => number
  /** Which way is an improvement, where there is one */
  better: Direction
}

export const METRICS: Metric[] = [
  {
    id: 'best-ld',
    label: 'Best lift / drag',
    unit: '',
    decimals: 2,
    read: (d) => d.polar.bestLiftToDrag.liftToDrag,
    better: 'higher',
  },
  {
    id: 'ld',
    label: 'Lift / drag here',
    unit: '',
    decimals: 2,
    read: (d) => d.results.liftToDrag,
    better: 'higher',
  },
  {
    id: 'span-efficiency',
    label: 'Span efficiency',
    unit: '',
    decimals: 4,
    read: (d) => d.results.spanEfficiency,
    better: 'higher',
  },
  {
    id: 'stall',
    label: 'Stall speed',
    unit: 'm/s',
    decimals: 2,
    read: (d) => d.results.envelope.stallSpeed,
    better: 'lower',
  },
  {
    id: 'cd0',
    label: 'Profile drag',
    unit: '',
    decimals: 5,
    read: (d) => d.results.drag.cd0,
    better: 'lower',
  },
  {
    id: 'cdi',
    label: 'Induced drag',
    unit: '',
    decimals: 5,
    read: (d) => d.results.drag.cdi,
    better: 'lower',
  },
  {
    id: 'aspect-ratio',
    label: 'Aspect ratio',
    unit: '',
    decimals: 2,
    read: (d) => d.results.geometry.aspectRatio,
    better: null,
  },
  {
    id: 'area',
    label: 'Wing area',
    unit: 'm²',
    decimals: 2,
    read: (d) => d.results.geometry.area,
    better: null,
  },
  {
    id: 'span',
    label: 'Span',
    unit: 'm',
    decimals: 2,
    read: (d) => d.params.wing.span,
    better: null,
  },
  {
    id: 'static-margin',
    label: 'Static margin',
    unit: '%',
    decimals: 1,
    // A band, not a direction: more is not better past a point.
    read: (d) => d.results.stability.staticMargin * 100,
    better: null,
  },
  {
    id: 'wing-loading',
    label: 'Wing loading',
    unit: 'N/m²',
    decimals: 0,
    read: (d) => d.results.wingLoading,
    better: null,
  },
]

export interface Delta {
  metric: Metric
  from: number
  to: number
  change: number
  /** Change as a fraction of the original, or null when it started at zero */
  fraction: number | null
  /** True when it moved the way the metric calls better; null when neither */
  improved: boolean | null
  /** True when the two are the same to the precision the metric is shown at */
  unchanged: boolean
}

export function compare(from: DesignSnapshot, to: DesignSnapshot): Delta[] {
  return METRICS.map((metric) => {
    const before = metric.read(from)
    const after = metric.read(to)
    const change = after - before

    // "Unchanged" means unchanged as displayed - a difference the reader cannot
    // see should not be dressed up as a result.
    const step = Math.pow(10, -metric.decimals) / 2
    const unchanged = Math.abs(change) < step

    let improved: boolean | null = null
    if (!unchanged && metric.better === 'higher') improved = change > 0
    if (!unchanged && metric.better === 'lower') improved = change < 0

    return {
      metric,
      from: before,
      to: after,
      change,
      fraction: before === 0 ? null : change / Math.abs(before),
      improved,
      unchanged,
    }
  })
}

export interface ComparisonScore {
  better: number
  worse: number
  unchanged: number
  /** Changed, but on a metric with no better direction - a choice, not a score */
  moved: number
}

/**
 * A one-line summary of a change.
 *
 * The four counts partition the metrics exactly. `moved` is the one that earns
 * its place: a bigger span or a different static margin genuinely changed
 * something without being an improvement or a regression, and folding those in
 * with the wins would overstate the case.
 */
export function scoreComparison(deltas: Delta[]): ComparisonScore {
  let better = 0
  let worse = 0
  let unchanged = 0
  let moved = 0

  for (const delta of deltas) {
    if (delta.unchanged) unchanged += 1
    else if (delta.improved === true) better += 1
    else if (delta.improved === false) worse += 1
    else moved += 1
  }

  return { better, worse, unchanged, moved }
}
