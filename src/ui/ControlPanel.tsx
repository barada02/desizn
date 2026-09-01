import { useId, useState } from 'react'
import {
  OPERATING_BOUNDS,
  WING_BOUNDS,
  isValidNaca,
  type ParamBound,
} from '../aero/params'
import { useDesign } from '../state/designStore'
import './controls.css'

/** How many decimals a control needs, read off its own step. */
function decimalsFor(step: number): number {
  if (step >= 1) return 0
  if (step >= 0.1) return 1
  return 2
}

interface SliderProps {
  bound: ParamBound
  value: number
  onChange: (value: number) => void
}

function Slider({ bound, value, onChange }: SliderProps) {
  const id = useId()
  const decimals = decimalsFor(bound.step)

  return (
    <div className="control">
      <div className="control-head">
        <label className="control-name" htmlFor={id}>
          {bound.label}
          <span className="sym">{bound.symbol}</span>
        </label>
        <span className="control-value">
          {value.toFixed(decimals)}
          {bound.unit && <span className="unit">{bound.unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={bound.min}
        max={bound.max}
        step={bound.step}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      <p className="control-help">
        <span>{bound.help}</span>
      </p>
    </div>
  )
}

const PRESETS: { code: string; note: string }[] = [
  { code: '0012', note: 'symmetric' },
  { code: '2412', note: 'classic' },
  { code: '4412', note: 'high lift' },
]

function AirfoilPicker() {
  const naca = useDesign((s) => s.params.wing.naca)
  const setWing = useDesign((s) => s.setWing)
  const [draft, setDraft] = useState(naca)

  // The committed code is the last valid one; the draft is whatever is typed.
  const valid = isValidNaca(draft)

  const commit = (code: string) => {
    setDraft(code)
    if (isValidNaca(code)) setWing({ naca: code })
  }

  return (
    <div className="airfoil">
      <div className="airfoil-entry">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          className={valid ? undefined : 'invalid'}
          aria-label="NACA 4-digit code"
          value={draft}
          onChange={(event) => commit(event.target.value.replace(/\D/g, ''))}
        />
        <span className={valid ? 'airfoil-status' : 'airfoil-status invalid'}>
          {valid
            ? `${Number(draft[0])}% camber at ${Number(draft[1]) * 10}%, ${Number(draft.slice(2))}% thick`
            : 'Four digits, with real thickness'}
        </span>
      </div>
      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.code}
            type="button"
            aria-pressed={naca === preset.code}
            onClick={() => commit(preset.code)}
          >
            {preset.code} · {preset.note}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ControlPanel() {
  const wing = useDesign((s) => s.params.wing)
  const operating = useDesign((s) => s.params.operating)
  const setWing = useDesign((s) => s.setWing)
  const setOperating = useDesign((s) => s.setOperating)
  const reset = useDesign((s) => s.reset)

  return (
    <>
      <section className="panel-group">
        <header>
          <span className="label">Planform</span>
          <span className="note">changes the shape</span>
        </header>
        {(Object.keys(WING_BOUNDS) as (keyof typeof WING_BOUNDS)[]).map((key) => (
          <Slider
            key={key}
            bound={WING_BOUNDS[key]}
            value={wing[key]}
            onChange={(value) => setWing({ [key]: value })}
          />
        ))}
      </section>

      <section className="panel-group">
        <header>
          <span className="label">Section</span>
          <span className="note">NACA 4-digit</span>
        </header>
        <AirfoilPicker />
      </section>

      <section className="panel-group">
        <header>
          <span className="label">Flight condition</span>
          <span className="note">changes the numbers</span>
        </header>
        {(Object.keys(OPERATING_BOUNDS) as (keyof typeof OPERATING_BOUNDS)[]).map(
          (key) => (
            <Slider
              key={key}
              bound={OPERATING_BOUNDS[key]}
              value={operating[key]}
              onChange={(value) => setOperating({ [key]: value })}
            />
          ),
        )}
      </section>

      <div className="panel-actions">
        <button type="button" onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </>
  )
}
