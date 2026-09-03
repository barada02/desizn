import { useMemo } from 'react'
import { useDesign } from '../state/designStore'
import {
  PLOT_B,
  PLOT_L,
  PLOT_R,
  PLOT_T,
  VB_H,
  VB_W,
  linear,
  polyline,
} from './scale'
import './chart.css'

/**
 * The V-n diagram: how hard the aircraft may be manoeuvred, at what speed.
 *
 * The curved left edges are aerodynamic - below them the wing simply cannot
 * generate the lift, because it would have to stall first. The flat top and
 * bottom are structural, and are a certification choice rather than anything
 * this model computes. Where the two meet is the manoeuvre speed: the fastest
 * you can pull the limit load without stalling out of it first, and the reason
 * that speed appears in every pilot's operating handbook.
 */
export function VnChart() {
  const envelope = useDesign((s) => s.results.envelope)

  const view = useMemo(() => {
    const vMax = envelope.diveSpeed * 1.06
    const nMin = envelope.limitLoadNegative * 1.35
    const nMax = envelope.limitLoadPositive * 1.15

    const x = linear(0, vMax, PLOT_L, PLOT_R)
    const y = linear(nMin, nMax, PLOT_B, PLOT_T)

    const project = (p: { v: number; n: number }) => ({ x: x(p.v), y: y(p.n) })

    // Round the envelope: out along the top, back along the bottom.
    const outline = [
      ...envelope.positiveBoundary,
      ...[...envelope.negativeBoundary].reverse(),
    ].map(project)

    return {
      x,
      y,
      vMax,
      nMin,
      nMax,
      area: `${polyline(outline)} Z`,
      positive: polyline(envelope.positiveBoundary.map(project)),
      negative: polyline(envelope.negativeBoundary.map(project)),
    }
  }, [envelope])

  const { x, y } = view

  const markers = [
    { v: envelope.stallSpeed, label: 'V_s' },
    { v: envelope.manoeuvreSpeed, label: 'V_A' },
    { v: envelope.diveSpeed, label: 'V_D' },
  ]

  const nTicks = [-1, 0, 1, 2, 3].filter((t) => t >= view.nMin && t <= view.nMax)

  return (
    <figure className="chart">
      <figcaption>
        <span className="label">Flight envelope</span>
        <span className="chart-legend">
          <span className="key">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="3.2" className="key-current" />
            </svg>
            Now
          </span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Flight envelope. Stall speed ${envelope.stallSpeed.toFixed(1)} metres per second, manoeuvre speed ${envelope.manoeuvreSpeed.toFixed(1)}, dive speed ${envelope.diveSpeed.toFixed(1)}. Currently pulling ${envelope.currentLoadFactor.toFixed(2)} g.`}
      >
        {nTicks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PLOT_L} x2={PLOT_R} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={PLOT_L - 7} y={y(tick) + 3.5} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        <path className="envelope-area" d={view.area} />
        <path className="envelope-edge" d={view.positive} />
        <path className="envelope-edge" d={view.negative} />

        <line className="axis" x1={PLOT_L} x2={PLOT_R} y1={y(0)} y2={y(0)} />

        {markers.map((marker) => (
          <g key={marker.label}>
            <line
              className="speed-mark"
              x1={x(marker.v)}
              x2={x(marker.v)}
              y1={PLOT_T}
              y2={PLOT_B}
            />
            <text
              className="tick"
              x={x(marker.v)}
              y={PLOT_T + 9}
              textAnchor="middle"
            >
              {marker.label}
            </text>
            <text
              className="tick"
              x={x(marker.v)}
              y={PLOT_B + 15}
              textAnchor="middle"
            >
              {marker.v.toFixed(0)}
            </text>
          </g>
        ))}

        <text className="axis-label" x={(PLOT_L + PLOT_R) / 2} y={VB_H - 3} textAnchor="middle">
          true airspeed, m/s
        </text>

        <circle
          className={
            envelope.outsideEnvelope ? 'marker-outside' : 'marker-current'
          }
          cx={x(Math.min(envelope.currentSpeed, view.vMax))}
          cy={y(Math.max(view.nMin, Math.min(view.nMax, envelope.currentLoadFactor)))}
          r="4.5"
        />
      </svg>

      <div className="chart-foot">
        {envelope.outsideEnvelope ? (
          <span className="caveat">
            Outside the envelope at{' '}
            <b className="mono">{envelope.currentLoadFactor.toFixed(2)}</b> g and{' '}
            <span className="mono">{envelope.currentSpeed.toFixed(0)} m/s</span>
          </span>
        ) : (
          <span>
            Stalls at <b className="mono">{envelope.stallSpeed.toFixed(1)} m/s</b>,
            pulling <span className="mono">{envelope.currentLoadFactor.toFixed(2)}</span> g
            now.
          </span>
        )}
      </div>
    </figure>
  )
}
