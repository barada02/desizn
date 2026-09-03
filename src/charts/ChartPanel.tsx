import { useState } from 'react'
import { DragPolarChart } from './DragPolarChart'
import { SpanLoadChart } from './SpanLoadChart'
import { VnChart } from './VnChart'
import './chart.css'

/**
 * One chart at a time.
 *
 * Three charts will not fit beside the readouts at a usable size, and stacking
 * them would eat the 3D view. A tab strip keeps the results panel a fixed
 * height however many charts get added later, and gives each one enough width
 * to be read rather than glanced at.
 */

const TABS = [
  { id: 'load', label: 'Spanwise load', hint: 'how the lift is shared across the span' },
  { id: 'polar', label: 'Drag polar', hint: 'what the wing costs at every angle' },
  { id: 'envelope', label: 'Flight envelope', hint: 'how hard it may be flown' },
] as const

type TabId = (typeof TABS)[number]['id']

export function ChartPanel() {
  const [active, setActive] = useState<TabId>('load')

  return (
    <div className="chart-panel">
      <div className="chart-tabs" role="tablist" aria-label="Results">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            title={tab.hint}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === 'load' && <SpanLoadChart />}
      {active === 'polar' && <DragPolarChart />}
      {active === 'envelope' && <VnChart />}
    </div>
  )
}
