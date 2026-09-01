import { SpanLoadChart } from './charts/SpanLoadChart'
import { Studio } from './scene/Studio'
import { useDesign } from './state/designStore'
import { ControlPanel } from './ui/ControlPanel'
import { Readouts } from './ui/Readouts'

function App() {
  const wing = useDesign((s) => s.params.wing)

  return (
    <div className="shell">
      <header className="topbar">
        <div className="mark">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M2 15.5 11 12V4.6c0-.9.4-1.6 1-1.6s1 .7 1 1.6V12l9 3.5v1.7l-9-2.4v3.6l2.6 1.7v1.3L12 20.6l-2.6.8v-1.3L12 18.4v-3.6l-10 2.4z"
              fill="currentColor"
            />
          </svg>
          <h1>desizn</h1>
        </div>
        <span className="tagline">Parametric wing studio</span>
      </header>

      <div className="main">
        <div className="stage">
          <div className="viewport">
            <Studio wing={wing} />
          </div>
          <div className="results">
            <SpanLoadChart />
            <Readouts />
          </div>
        </div>
        <aside className="sidebar">
          <ControlPanel />
        </aside>
      </div>
    </div>
  )
}

export default App
