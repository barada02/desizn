import { useMemo, useState } from 'react'
import type { SpanStation } from '../aero/llt'
import { useDesign } from '../state/designStore'
import './chart.css'

/**
 * Spanwise load, against the elliptical ideal.
 *
 * This is the chart the whole app exists to draw. The solid curve is what this
 * wing actually carries; the dashed one is the distribution that would make the
 * least induced drag for the same span. How close they sit is the number 'e'
 * beneath them, and watching the gap close as taper changes is the point.
 */

const VB_W = 460
const VB_H = 196
const PAD_L = 34
const PAD_R = 12
const PAD_T = 12
const PAD_B = 30

const PLOT_L = PAD_L
const PLOT_R = VB_W - PAD_R
const PLOT_T = PAD_T
const PLOT_B = VB_H - PAD_B
const PLOT_W = PLOT_R - PLOT_L
const PLOT_H = PLOT_B - PLOT_T

interface PlotPoint {
  eta: number
  load: number
}

export function SpanLoadChart() {
  const stations = useDesign((s) => s.results.stations)
  const spanEfficiency = useDesign((s) => s.results.spanEfficiency)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const { curve, ideal, toX, toY, yMin, yMax } = useMemo(() => {
    // The solve never places a station exactly at the tip, but the load there
    // is zero by definition - so close the curve onto the tips.
    const points: PlotPoint[] = [
      { eta: -1, load: 0 },
      ...stations.map((s) => ({ eta: s.eta, load: s.load })),
      { eta: 1, load: 0 },
    ]

    const loads = points.map((p) => p.load)
    const yMax = Math.max(1.05, ...loads) * 1.04
    const yMin = Math.min(0, ...loads) * 1.08

    const toX = (eta: number) => PLOT_L + ((eta + 1) / 2) * PLOT_W
    const toY = (v: number) => PLOT_B - ((v - yMin) / (yMax - yMin)) * PLOT_H

    const path = (pts: PlotPoint[]) =>
      pts
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'}${toX(p.eta).toFixed(2)},${toY(p.load).toFixed(2)}`,
        )
        .join(' ')

    const idealPoints: PlotPoint[] = Array.from({ length: 97 }, (_, i) => {
      const eta = -1 + (2 * i) / 96
      return { eta, load: Math.sqrt(Math.max(0, 1 - eta * eta)) }
    })

    return {
      curve: { line: path(points), points },
      ideal: path(idealPoints),
      toX,
      toY,
      yMin,
      yMax,
    }
  }, [stations])

  const area = `${curve.line} L${toX(1).toFixed(2)},${toY(0).toFixed(2)} L${toX(-1).toFixed(2)},${toY(0).toFixed(2)} Z`

  const hovered: SpanStation | null =
    hoverIndex === null ? null : (stations[hoverIndex] ?? null)

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * VB_W
    const eta = ((x - PLOT_L) / PLOT_W) * 2 - 1

    if (eta < -1.05 || eta > 1.05 || stations.length === 0) {
      setHoverIndex(null)
      return
    }

    let nearest = 0
    for (let i = 1; i < stations.length; i++) {
      if (Math.abs(stations[i].eta - eta) < Math.abs(stations[nearest].eta - eta)) {
        nearest = i
      }
    }
    setHoverIndex(nearest)
  }

  const yTicks = [0, 0.5, 1].filter((t) => t >= yMin && t <= yMax)
  const xTicks = [-1, -0.5, 0, 0.5, 1]

  return (
    <figure className="chart">
      <figcaption>
        <span className="label">Spanwise load</span>
        <span className="chart-legend">
          <span className="key">
            <svg width="16" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" className="key-actual" />
            </svg>
            This wing
          </span>
          <span className="key">
            <svg width="16" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" className="key-ideal" />
            </svg>
            Elliptical
          </span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Spanwise load distribution compared with the elliptical ideal. Span efficiency ${spanEfficiency.toFixed(3)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="grid"
              x1={PLOT_L}
              x2={PLOT_R}
              y1={toY(tick)}
              y2={toY(tick)}
            />
            <text className="tick" x={PLOT_L - 7} y={toY(tick) + 3.5} textAnchor="end">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        <line className="axis" x1={PLOT_L} x2={PLOT_R} y1={toY(0)} y2={toY(0)} />

        {xTicks.map((tick) => (
          <text
            key={tick}
            className="tick"
            x={toX(tick)}
            y={PLOT_B + 15}
            textAnchor="middle"
          >
            {tick}
          </text>
        ))}
        <text className="axis-label" x={(PLOT_L + PLOT_R) / 2} y={VB_H - 3} textAnchor="middle">
          spanwise station, 2y / b
        </text>

        <path className="load-area" d={area} />
        <path className="load-ideal" d={ideal} />
        <path className="load-line" d={curve.line} />

        {hovered && (
          <g className="cursor">
            <line
              x1={toX(hovered.eta)}
              x2={toX(hovered.eta)}
              y1={PLOT_T}
              y2={PLOT_B}
            />
            <circle cx={toX(hovered.eta)} cy={toY(hovered.load)} r="3.5" />
          </g>
        )}

        <rect
          x={PLOT_L}
          y={PLOT_T}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
        />
      </svg>

      <div className="chart-foot">
        {hovered ? (
          <span className="mono">
            2y/b {hovered.eta.toFixed(2)} · c {hovered.chord.toFixed(2)} m · c
            <sub>l</sub> {hovered.cl.toFixed(3)}
          </span>
        ) : (
          <span>
            Span efficiency{' '}
            <b className="mono">{spanEfficiency.toFixed(3)}</b> — the fraction of
            ideal this shape achieves.
          </span>
        )}
      </div>
    </figure>
  )
}
