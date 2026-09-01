import { useDesign } from '../state/designStore'
import './readouts.css'

/**
 * What the wing is doing, at a glance.
 *
 * The four tiles are the numbers a design decision actually turns on; the list
 * beneath them is the supporting detail you go looking for once a tile has told
 * you something is interesting.
 */

function millions(value: number): string {
  return `${(value / 1e6).toFixed(2)}M`
}

/** Span efficiency, drawn on the range where it actually lives. */
function EfficiencyMeter({ value }: { value: number }) {
  const floor = 0.7
  const fraction = Math.max(0, Math.min(1, (value - floor) / (1 - floor)))

  return (
    <div
      className="meter"
      role="img"
      aria-label={`Span efficiency ${value.toFixed(3)} of a possible 1.0`}
    >
      <div className="meter-fill" style={{ width: `${fraction * 100}%` }} />
    </div>
  )
}

export function Readouts() {
  const results = useDesign((s) => s.results)
  const alpha = useDesign((s) => s.params.operating.alpha)

  const { geometry, drag, air } = results
  const trimGap = results.alphaForLevelFlight - alpha

  return (
    <div className="readouts">
      <div className="tiles">
        <div className="tile">
          <span className="label">Span efficiency</span>
          <span className="figure mono">{results.spanEfficiency.toFixed(3)}</span>
          <EfficiencyMeter value={results.spanEfficiency} />
        </div>
        <div className="tile">
          <span className="label">Lift / drag</span>
          <span className="figure mono">{results.liftToDrag.toFixed(1)}</span>
          <span className="sub">at {alpha.toFixed(1)}&deg;</span>
        </div>
        <div className="tile">
          <span className="label">Aspect ratio</span>
          <span className="figure mono">{geometry.aspectRatio.toFixed(2)}</span>
          <span className="sub">{geometry.area.toFixed(2)} m&sup2; wing</span>
        </div>
        <div className="tile">
          <span className="label">Lift coefficient</span>
          <span className="figure mono">{results.cl.toFixed(3)}</span>
          <span className="sub">needs {results.clRequired.toFixed(3)}</span>
        </div>
      </div>

      <div
        className={
          results.sustainsLevelFlight ? 'verdict is-good' : 'verdict is-warn'
        }
      >
        <span className="dot" aria-hidden="true" />
        <span>
          {results.sustainsLevelFlight
            ? 'Holds level flight at this condition'
            : 'Not making enough lift to hold level flight'}
          {Math.abs(trimGap) > 0.05 && (
            <>
              {' — trims at '}
              <b className="mono">{results.alphaForLevelFlight.toFixed(1)}&deg;</b>
            </>
          )}
        </span>
      </div>

      <dl className="detail">
        <div>
          <dt>MAC</dt>
          <dd className="mono">{geometry.mac.toFixed(3)} m</dd>
        </div>
        <div>
          <dt>
            C<sub>D0</sub>
          </dt>
          <dd className="mono">{drag.cd0.toFixed(5)}</dd>
        </div>
        <div>
          <dt>
            C<sub>Di</sub>
          </dt>
          <dd className="mono">{drag.cdi.toFixed(5)}</dd>
        </div>
        <div>
          <dt>
            C<sub>L&alpha;</sub>
          </dt>
          <dd className="mono">{results.clAlpha.toFixed(3)} /rad</dd>
        </div>
        <div>
          <dt>Reynolds</dt>
          <dd className="mono">{millions(drag.reynolds)}</dd>
        </div>
        <div>
          <dt>Wing loading</dt>
          <dd className="mono">{results.wingLoading.toFixed(0)} N/m&sup2;</dd>
        </div>
        <div>
          <dt>Zero-lift &alpha;</dt>
          <dd className="mono">{results.zeroLiftAlpha.toFixed(2)}&deg;</dd>
        </div>
        <div>
          <dt>Air density</dt>
          <dd className="mono">{air.density.toFixed(3)} kg/m&sup3;</dd>
        </div>
      </dl>
    </div>
  )
}
