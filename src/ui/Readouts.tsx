import { COMFORTABLE_MARGIN, type StabilityVerdict } from '../aero/stability'
import { BALANCE_BOUNDS } from '../aero/params'
import { useDesign } from '../state/designStore'
import './readouts.css'

/**
 * What the aircraft is doing, at a glance.
 *
 * Six tiles carry the numbers a design decision turns on; the list beneath is
 * the supporting detail you go looking for once a tile has told you something
 * is interesting.
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

/**
 * Where the mass sits relative to where it could sit.
 *
 * The bar is the CG's whole travel. The shaded band is the range that gives a
 * comfortable static margin, and the tick is the neutral point - the CG marker
 * crossing it is the moment the aircraft stops being stable.
 */
function MarginMeter({
  cg,
  neutralPoint,
  verdict,
}: {
  cg: number
  neutralPoint: number
  verdict: StabilityVerdict
}) {
  const { min, max } = BALANCE_BOUNDS.cg
  const place = (value: number) =>
    Math.max(0, Math.min(1, (value - min) / (max - min))) * 100

  const bandStart = place(neutralPoint - COMFORTABLE_MARGIN.max)
  const bandEnd = place(neutralPoint - COMFORTABLE_MARGIN.min)

  return (
    <div
      className={`margin-meter is-${verdict}`}
      role="img"
      aria-label={`Centre of gravity at ${(cg * 100).toFixed(1)} percent of chord, neutral point at ${(neutralPoint * 100).toFixed(1)} percent`}
    >
      <div
        className="band"
        style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }}
      />
      <div className="np" style={{ left: `${place(neutralPoint)}%` }} />
      <div className="cg" style={{ left: `${place(cg)}%` }} />
    </div>
  )
}

const VERDICT_TEXT: Record<StabilityVerdict, string> = {
  unstable: 'Unstable — the CG is behind the neutral point',
  marginal: 'Barely stable — very light in pitch',
  stable: 'Comfortably stable in pitch',
  'very-stable': 'Very stable — heavy in pitch, and it will resist manoeuvring',
}

const VERDICT_TONE: Record<StabilityVerdict, string> = {
  unstable: 'is-bad',
  marginal: 'is-warn',
  stable: 'is-good',
  'very-stable': 'is-warn',
}

export function Readouts() {
  const results = useDesign((s) => s.results)
  const polar = useDesign((s) => s.polar)
  const cg = useDesign((s) => s.params.balance.cg)
  const alpha = useDesign((s) => s.params.operating.alpha)

  const { geometry, drag, air, stability, envelope } = results
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
          <span className="sub">
            best {polar.bestLiftToDrag.liftToDrag.toFixed(1)} at{' '}
            {polar.bestLiftToDrag.alpha.toFixed(1)}&deg;
          </span>
        </div>
        <div className="tile">
          <span className="label">Static margin</span>
          <span className="figure mono">
            {(stability.staticMargin * 100).toFixed(1)}
            <span className="unit">%</span>
          </span>
          <MarginMeter
            cg={cg}
            neutralPoint={stability.neutralPoint}
            verdict={stability.verdict}
          />
        </div>
        <div className="tile">
          <span className="label">Stall speed</span>
          <span className="figure mono">{envelope.stallSpeed.toFixed(1)}</span>
          <span className="sub">m/s at {envelope.alphaStall.toFixed(1)}&deg;</span>
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

      <div className={`verdict ${VERDICT_TONE[stability.verdict]}`}>
        <span className="dot" aria-hidden="true" />
        <span>{VERDICT_TEXT[stability.verdict]}</span>
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

      {envelope.stallsAtTip && (
        <div className="verdict is-warn">
          <span className="dot" aria-hidden="true" />
          <span>
            Stall starts at{' '}
            <b className="mono">{Math.abs(envelope.criticalEta).toFixed(2)}</b> semi-span,
            out by the ailerons. More washout moves it inboard.
          </span>
        </div>
      )}

      {results.beyondLinear && (
        <div className="verdict is-warn">
          <span className="dot" aria-hidden="true" />
          <span>
            Past linear theory — a section is carrying c<sub>l</sub>{' '}
            <b className="mono">{results.maxSectionCl.toFixed(2)}</b>, where a real
            one would be close to stalling. These numbers are optimistic.
          </span>
        </div>
      )}

      <dl className="detail">
        <div>
          <dt>Neutral point</dt>
          <dd className="mono">{(stability.neutralPoint * 100).toFixed(1)}% MAC</dd>
        </div>
        <div>
          <dt>Tail volume</dt>
          <dd className="mono">{stability.tailVolume.toFixed(3)}</dd>
        </div>
        <div>
          <dt>MAC</dt>
          <dd className="mono">{geometry.mac.toFixed(3)} m</dd>
        </div>
        <div>
          <dt>Wing C<sub>Lmax</sub></dt>
          <dd className="mono">{envelope.clMax.toFixed(3)}</dd>
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
          <dt>Manoeuvre speed</dt>
          <dd className="mono">{envelope.manoeuvreSpeed.toFixed(1)} m/s</dd>
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
          <dt>Air density</dt>
          <dd className="mono">{air.density.toFixed(3)} kg/m&sup3;</dd>
        </div>
      </dl>
    </div>
  )
}
