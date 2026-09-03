import type { Delta } from '../design/compare'
import { useDesign } from '../state/designStore'
import './compare.css'

/**
 * What the last few moves actually did.
 *
 * Pin a design and every subsequent edit is measured against it. Only the
 * metrics that moved are listed - a table where most rows say "no change" makes
 * the reader do the filtering.
 *
 * Metrics with no better direction are shown as moved rather than won or lost.
 * A bigger span is a choice, and colouring it green would be a lie.
 */

function Row({ delta }: { delta: Delta }) {
  const { metric, from, to, change, improved } = delta
  const tone = improved === true ? 'is-better' : improved === false ? 'is-worse' : 'is-moved'

  return (
    <li className={`delta ${tone}`}>
      <span className="delta-label">{metric.label}</span>
      <span className="delta-numbers mono">
        <span className="delta-from">{from.toFixed(metric.decimals)}</span>
        <span className="delta-arrow" aria-hidden="true">
          →
        </span>
        <span className="delta-to">{to.toFixed(metric.decimals)}</span>
      </span>
      <span className="delta-change mono">
        {change > 0 ? '+' : ''}
        {change.toFixed(metric.decimals)}
        {improved === true && <span className="delta-word"> better</span>}
        {improved === false && <span className="delta-word"> worse</span>}
      </span>
    </li>
  )
}

export function ComparePanel() {
  const pinned = useDesign((s) => s.pinned)
  const deltas = useDesign((s) => s.deltas)
  const score = useDesign((s) => s.score)
  const pin = useDesign((s) => s.pin)
  const unpin = useDesign((s) => s.unpin)

  if (!pinned || !score) {
    return (
      <div className="compare compare-empty">
        <span className="label">Compare</span>
        <p>
          Pin the design as it stands, then every change you make is measured
          against it.
        </p>
        <button type="button" onClick={pin}>
          Pin this design
        </button>
      </div>
    )
  }

  const changed = deltas.filter((delta) => !delta.unchanged)

  return (
    <div className="compare">
      <header>
        <span className="label">Against pinned</span>
        <button type="button" className="link" onClick={pin}>
          Re-pin
        </button>
        <button type="button" className="link" onClick={unpin}>
          Clear
        </button>
      </header>

      <p className="compare-score">
        {score.better > 0 && <span className="is-better">{score.better} better</span>}
        {score.better > 0 && (score.worse > 0 || score.moved > 0) && ' · '}
        {score.worse > 0 && <span className="is-worse">{score.worse} worse</span>}
        {score.worse > 0 && score.moved > 0 && ' · '}
        {score.moved > 0 && <span className="is-moved">{score.moved} moved</span>}
        {changed.length === 0 && 'Identical to the pinned design'}
      </p>

      {changed.length > 0 && (
        <ul className="delta-list">
          {changed.map((delta) => (
            <Row key={delta.metric.id} delta={delta} />
          ))}
        </ul>
      )}

      {score.unchanged > 0 && changed.length > 0 && (
        <p className="compare-rest">{score.unchanged} unchanged</p>
      )}
    </div>
  )
}
