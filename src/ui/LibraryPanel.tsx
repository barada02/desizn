import { useState } from 'react'
import { useDesign } from '../state/designStore'
import './compare.css'

/**
 * Saved designs.
 *
 * Kept in this browser, on this machine - nothing leaves the device, and the
 * panel says so rather than leaving someone to wonder where their work went.
 */

function when(savedAt: number): string {
  if (!savedAt) return ''
  return new Date(savedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

export function LibraryPanel() {
  const saved = useDesign((s) => s.saved)
  const storageOk = useDesign((s) => s.storageOk)
  const saveCurrent = useDesign((s) => s.saveCurrent)
  const loadSaved = useDesign((s) => s.loadSaved)
  const removeSaved = useDesign((s) => s.removeSaved)

  const [name, setName] = useState('')
  const [failed, setFailed] = useState(false)

  const commit = () => {
    if (!name.trim()) return
    setFailed(!saveCurrent(name))
    setName('')
  }

  return (
    <section className="panel-group">
      <header>
        <span className="label">Designs</span>
        <span className="note">kept in this browser</span>
      </header>

      {storageOk ? (
        <>
          <div className="library-save">
            <input
              type="text"
              value={name}
              placeholder="Name this design"
              aria-label="Design name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
              }}
            />
            <button type="button" onClick={commit} disabled={!name.trim()}>
              Save
            </button>
          </div>

          {failed && (
            <p className="library-note is-warn">
              The browser refused to store that — it may be out of space, or
              blocking site data.
            </p>
          )}

          {saved.length === 0 ? (
            <p className="library-note">
              Nothing saved yet. Saving under a name you have used before
              replaces it.
            </p>
          ) : (
            <ul className="library-list">
              {saved.map((design) => (
                <li key={design.id}>
                  <button
                    type="button"
                    className="library-load"
                    onClick={() => loadSaved(design.id)}
                    title="Load this design"
                  >
                    <span className="library-name">{design.name}</span>
                    <span className="library-when mono">{when(design.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="library-remove"
                    aria-label={`Delete ${design.name}`}
                    onClick={() => removeSaved(design.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="library-note is-warn">
          This browser will not let the page store anything, so designs cannot be
          saved. A private window or blocked site data will do that.
        </p>
      )}
    </section>
  )
}
