import { useMemo, useState } from 'react'
import type { PolarPoint } from '../aero/polar'
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
 * The drag polar: lift against drag, every angle the wing can be flown at.
 *
 * Two constructions make it readable rather than just a curve. The straight
 * line from the origin is a tangent - wherever it touches the polar is the best
 * lift-to-drag ratio the wing has, because L/D is exactly the slope of a line
 * from the origin to a point on the curve. And the section past the linear
 * limit is drawn faintly, because lifting-line theory does not know what a
 * stall is and should not be trusted to draw one.
 */
export function DragPolarChart() {
  const polar = useDesign((s) => s.polar)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const view = useMemo(() => {
    const points = polar.points
    const cds = points.map((p) => p.cd)
    const cls = points.map((p) => p.cl)

    const cdMax = Math.max(...cds) * 1.06
    const clMin = Math.min(...cls, 0)
    const clMax = Math.max(...cls) * 1.06

    const x = linear(0, cdMax, PLOT_L, PLOT_R)
    const y = linear(clMin, clMax, PLOT_B, PLOT_T)

    const project = (p: PolarPoint) => ({ x: x(p.cd), y: y(p.cl) })
    const trusted = points.filter((p) => !p.beyondLinear)
    const beyond = points.filter((p) => p.beyondLinear)

    // Keep the faint section joined to the solid one rather than floating.
    const bridge = trusted.length > 0 && beyond.length > 0 ? [trusted.at(-1)!] : []

    return {
      x,
      y,
      cdMax,
      clMin,
      clMax,
      trustedPath: polyline(trusted.map(project)),
      beyondPath: polyline([...bridge, ...beyond].map(project)),
      project,
    }
  }, [polar])

  const { x, y, project } = view
  const best = polar.bestLiftToDrag
  const current = polar.current
  const hovered = hoverIndex === null ? null : (polar.points[hoverIndex] ?? null)
  const shown = hovered ?? current

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * VB_W
    const py = ((event.clientY - rect.top) / rect.height) * VB_H

    let nearest = 0
    let bestDistance = Infinity
    polar.points.forEach((point, index) => {
      const at = project(point)
      const distance = (at.x - px) ** 2 + (at.y - py) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        nearest = index
      }
    })

    setHoverIndex(bestDistance < 900 ? nearest : null)
  }

  // The tangent runs from the origin through the best point and a little past.
  const bestAt = project(best)
  const tangentEnd = {
    x: x(0) + (bestAt.x - x(0)) * 1.18,
    y: y(0) + (bestAt.y - y(0)) * 1.18,
  }

  const cdTicks = [0, view.cdMax / 2, view.cdMax].map((v) => Number(v.toFixed(3)))
  const clTicks = [0, 0.5, 1, 1.5].filter((t) => t >= view.clMin && t <= view.clMax)

  return (
    <figure className="chart">
      <figcaption>
        <span className="label">Drag polar</span>
        <span className="chart-legend">
          <span className="key">
            <svg width="16" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" className="key-actual" />
            </svg>
            C<sub>L</sub> vs C<sub>D</sub>
          </span>
          <span className="key">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="3.2" className="key-best" />
            </svg>
            Best L/D
          </span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Drag polar. Best lift to drag ${best.liftToDrag.toFixed(1)} at ${best.alpha.toFixed(1)} degrees. Currently ${current.liftToDrag.toFixed(1)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {clTicks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PLOT_L} x2={PLOT_R} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={PLOT_L - 7} y={y(tick) + 3.5} textAnchor="end">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        {cdTicks.map((tick) => (
          <text
            key={tick}
            className="tick"
            x={x(tick)}
            y={PLOT_B + 15}
            textAnchor={tick === 0 ? 'start' : 'middle'}
          >
            {tick.toFixed(3)}
          </text>
        ))}

        <text className="axis-label" x={(PLOT_L + PLOT_R) / 2} y={VB_H - 3} textAnchor="middle">
          drag coefficient, C<tspan dy="2" fontSize="7">D</tspan>
        </text>

        <line
          className="tangent"
          x1={x(0)}
          y1={y(0)}
          x2={tangentEnd.x}
          y2={tangentEnd.y}
        />

        <path className="polar-beyond" d={view.beyondPath} />
        <path className="load-line" d={view.trustedPath} />

        <circle className="marker-best" cx={bestAt.x} cy={bestAt.y} r="4" />
        <circle
          className="marker-current"
          cx={project(current).x}
          cy={project(current).y}
          r="4.5"
        />

        {hovered && (
          <circle
            className="marker-hover"
            cx={project(hovered).x}
            cy={project(hovered).y}
            r="3.5"
          />
        )}
      </svg>

      <div className="chart-foot">
        <span className="mono">
          {hovered ? '' : 'now '}
          &alpha; {shown.alpha.toFixed(1)}&deg; · L/D {shown.liftToDrag.toFixed(1)} ·
          C<sub>D</sub> {shown.cd.toFixed(4)}
        </span>
        {shown.beyondLinear && <span className="caveat"> past linear theory</span>}
        {!shown.beyondLinear && (
          <span className="muted">
            {' '}
            · best <b className="mono">{best.liftToDrag.toFixed(1)}</b> at{' '}
            <span className="mono">{best.alpha.toFixed(1)}&deg;</span>
          </span>
        )}
      </div>
    </figure>
  )
}
