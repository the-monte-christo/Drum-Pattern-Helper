import { patternDuration } from '../../shared/pattern.js';
import { Icon } from './ui.jsx';

// Linke Spalte; auf schmalen Bildschirmen eine Schublade.
export function Sidebar({ label, open, onClose, children }) {
  return (
    <>
      <aside class={`sidebar${open ? ' is-open' : ''}`} aria-label={label}>
        {children}
      </aside>
      {open && <div class="scrim" onClick={onClose} />}
    </>
  );
}

export function ListHead({ title, onAdd, onClose }) {
  return (
    <div class="list-head">
      <h2 class="section-title">{title}</h2>
      <div class="list-head-actions">
        {onAdd && (
          <button type="button" class="btn btn--small" onClick={() => onAdd()}>
            <Icon name="plus" size={16} /> Neu
          </button>
        )}
        <button type="button" class="icon-btn drawer-close" aria-label="Liste schließen" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

// Umschalter oberhalb der Liste (Arrangement-Ebene: Arrangements oder Pattern).
export function Segmented({ label, options, value, onChange }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button type="button" class="segment" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function ItemTags({ tags }) {
  return tags.length > 0 ? <span class="pattern-item-tags">{tags.join(' · ')}</span> : null;
}

export function formatDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// mode="select": Pattern auswählen; mode="add": Pattern ans Arrangement anhängen (counts = Vorkommen darin).
export function PatternList({ patterns, selectedId, onPick, mode = 'select', counts, emptyText }) {
  if (!patterns.length) return <p class="empty-hint">{emptyText}</p>;
  return (
    <ul class="pattern-list">
      {patterns.map((p) => {
        const count = counts?.get(p.id) ?? 0;
        return (
          <li key={p.id}>
            <button
              type="button"
              class={`pattern-item${mode === 'add' ? ' pattern-item--add' : ''}`}
              aria-current={mode === 'select' && p.id === selectedId ? 'true' : undefined}
              aria-label={mode === 'add' ? `„${p.name}“ zum Arrangement hinzufügen` : undefined}
              onClick={() => onPick(p)}
            >
              <span class="pattern-item-main">
                <span class="pattern-item-name">{p.name || 'Ohne Namen'}</span>
                <ItemTags tags={p.tags} />
              </span>
              <span class="pattern-item-meta">
                {count > 0 && <span class="count-badge" title={`${count}× im Arrangement`}>{count}×</span>}
                <span class="tag">{p.beats}/4</span>
                <span class="pattern-item-bpm">
                  {p.bpm}
                  <small> bpm</small>
                </span>
                {mode === 'add' && (
                  <span class="add-mark" aria-hidden="true">
                    <Icon name="plus" size={16} />
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ArrangementList({ arrangements, patternsById, selectedId, onPick, emptyText }) {
  if (!arrangements.length) return <p class="empty-hint">{emptyText}</p>;
  return (
    <ul class="pattern-list">
      {arrangements.map((a) => {
        const patterns = a.items.map((id) => patternsById.get(id)).filter(Boolean);
        const seconds = patterns.reduce((sum, p) => sum + patternDuration(p), 0);
        return (
          <li key={a.id}>
            <button
              type="button"
              class="pattern-item"
              aria-current={a.id === selectedId ? 'true' : undefined}
              onClick={() => onPick(a)}
            >
              <span class="pattern-item-main">
                <span class="pattern-item-name">{a.name || 'Ohne Namen'}</span>
                <ItemTags tags={a.tags} />
              </span>
              <span class="pattern-item-meta">
                <span class="tag">{patterns.length} P</span>
                <span class="pattern-item-bpm">{formatDuration(seconds)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
