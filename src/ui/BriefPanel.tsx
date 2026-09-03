import { BRIEFS } from '../design/briefs'
import { describeLimits, type RequirementCheck } from '../design/requirements'
import { useDesign } from '../state/designStore'
import './brief.css'

/**
 * What you are trying to achieve, and how close you are.
 *
 * This is the difference between moving sliders and designing something. Each
 * row says what is being asked, what the design currently manages, and - when
 * it falls short - which way it has to move.
 */

function Row({ check }: { check: RequirementCheck }) {
  const { requirement, value, passes, direction } = check
  const decimals = requirement.decimals ?? 0

  return (
    <li className={passes ? 'req is-met' : 'req is-missed'}>
      <span className="req-mark" aria-hidden="true" />
      <span className="req-body">
        <span className="req-head">
          <span className="req-label">{requirement.label}</span>
          <span className="req-value mono">
            {value.toFixed(decimals)}
            {requirement.unit && <span className="unit"> {requirement.unit}</span>}
          </span>
        </span>
        <span className="req-limit">
          {describeLimits(requirement)}
          {direction === 'higher' && <span className="req-arrow"> — needs more</span>}
          {direction === 'lower' && <span className="req-arrow"> — needs less</span>}
        </span>
        <span className="req-detail">
          <span>{requirement.detail}</span>
        </span>
      </span>
    </li>
  )
}

export function BriefPanel() {
  const briefId = useDesign((s) => s.briefId)
  const brief = useDesign((s) => s.brief)
  const setBrief = useDesign((s) => s.setBrief)

  const hasRequirements = brief.total > 0

  return (
    <section className="panel-group brief-panel">
      <header>
        <span className="label">Design brief</span>
        {hasRequirements && (
          <span className={brief.allMet ? 'brief-score is-met' : 'brief-score'}>
            {brief.met} of {brief.total} met
          </span>
        )}
      </header>

      <div className="presets">
        {BRIEFS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={briefId === option.id}
            onClick={() => setBrief(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <p className="brief-summary">{brief.brief.summary}</p>

      {hasRequirements && (
        <>
          {brief.allMet && (
            <p className="brief-done">
              Every requirement met. Now try to beat it — more glide, less span,
              a slower stall.
            </p>
          )}
          <ul className="req-list">
            {brief.checks.map((check) => (
              <Row key={check.requirement.id} check={check} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
