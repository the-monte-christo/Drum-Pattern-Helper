import { Icon } from './ui.jsx';

export function Sidebar({ patterns, selectedId, onSelect, onAdd, open, onClose }) {
  return (
    <>
      <aside class={`sidebar${open ? ' is-open' : ''}`} aria-label="Pattern-Liste">
        <div class="sidebar-head">
          <div class="brand">
            <span class="brand-mark" aria-hidden="true" />
            <span>Drum Pattern Helper</span>
          </div>
          <button type="button" class="icon-btn drawer-close" aria-label="Liste schließen" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div class="list-head">
          <h2 class="section-title">Pattern</h2>
          <button type="button" class="btn btn--small" onClick={() => onAdd()}>
            <Icon name="plus" size={16} /> Neu
          </button>
        </div>

        <ul class="pattern-list">
          {patterns.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                class="pattern-item"
                aria-current={p.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(p.id)}
              >
                <span class="pattern-item-name">{p.name || 'Ohne Namen'}</span>
                <span class="pattern-item-meta">
                  <span class="tag">{p.beats}/4</span>
                  <span class="pattern-item-bpm">
                    {p.bpm}
                    <small> bpm</small>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {patterns.length === 0 && <p class="empty-hint">Noch keine Pattern. Lege mit „Neu“ eins an.</p>}
      </aside>
      {open && <div class="scrim" onClick={onClose} />}
    </>
  );
}
