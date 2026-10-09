import { useRef } from 'preact/hooks';
import { ARRANGEMENT_LIMITS, removeItem, swapItems } from '../../shared/arrangement.js';
import { patternDuration } from '../../shared/pattern.js';
import { HeaderTitle } from './HeaderTitle.jsx';
import { formatDuration } from './Sidebar.jsx';
import { TagEditor } from './Tags.jsx';
import { Icon, useAnimationFrame } from './ui.jsx';

export function ArrangementHeader({ arrangement, status, tagSuggestions, onEdit, onDuplicate, onDelete }) {
  return (
    <header class="pattern-header">
      <HeaderTitle
        kind="Arrangement"
        name={arrangement.name}
        maxLength={ARRANGEMENT_LIMITS.nameMax}
        fallbackName="Neues Arrangement"
        status={status}
        onRename={(name) => onEdit((a) => ({ ...a, name }))}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
      <div class="header-row">
        <TagEditor
          tags={arrangement.tags}
          suggestions={tagSuggestions}
          onChange={(tags) => onEdit((a) => ({ ...a, tags }))}
        />
      </div>
    </header>
  );
}

// Der Strang: Pattern in Abspielreihenfolge, je ein Takt. ⇄ tauscht zwei Nachbarn.
export function Strand({ entries, engine, playing, onEdit, onShowPatterns }) {
  const strandRef = useRef(null);
  const now = useRef({ item: -1, el: null });

  // Laufendes Pattern hervorheben und Fortschritt im Takt zeigen – direkt im DOM, ohne Re-Render.
  useAnimationFrame(playing, (active) => {
    const root = strandRef.current;
    if (!root) return;
    const pos = active ? engine.position() : null;
    const item = pos ? pos.item : -1;
    // Nach Tauschen/Entfernen sind die Elemente neu – dann ebenfalls neu zuordnen.
    if (item !== now.current.item || (now.current.el && !now.current.el.isConnected)) {
      now.current.el?.classList.remove('is-now');
      now.current.el?.querySelector('.strand-progress')?.style.setProperty('width', '0');
      const el = item >= 0 ? root.querySelector(`[data-k="${item}"]`) : null;
      el?.classList.add('is-now');
      now.current = { item, el };
    }
    if (pos && now.current.el) {
      const bar = now.current.el.querySelector('.strand-progress');
      if (bar) bar.style.width = `${((pos.beat + pos.frac) / pos.beats) * 100}%`;
    }
  });

  const seconds = entries.reduce((sum, e) => sum + patternDuration(e.pattern), 0);

  return (
    <section class="panel" aria-labelledby="strand-title">
      <div class="panel-head">
        <h2 class="section-title" id="strand-title">
          Strang
        </h2>
        <span class="panel-hint">Je Pattern ein Takt · ⇄ tauscht benachbarte Pattern</span>
        <div class="panel-head-actions">
          <span class="panel-note">
            {entries.length} Pattern · {formatDuration(seconds)}
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div class="strand-empty">
          <p>Noch keine Pattern im Arrangement.</p>
          <button type="button" class="btn" onClick={onShowPatterns}>
            <Icon name="plus" size={16} /> Pattern hinzufügen
          </button>
        </div>
      ) : (
        <ol class="strand" ref={strandRef}>
          {entries.map((entry, k) => {
            const p = entry.pattern;
            const prev = entries[k - 1];
            return (
              <li class="strand-cell" key={`${k}-${p.id}`}>
                {prev && (
                  <button
                    type="button"
                    class="swap-btn"
                    aria-label={`Position ${k} und ${k + 1} tauschen`}
                    title="Tauschen"
                    onClick={() => onEdit((a) => swapItems(a, prev.index, entry.index))}
                  >
                    <Icon name="swap" size={18} />
                  </button>
                )}
                <div class="strand-item" data-k={k} style={{ '--beats': p.beats }}>
                  <span class="strand-index">{k + 1}</span>
                  <span class="strand-name">{p.name}</span>
                  <span class="strand-meta">
                    {p.beats}/4 · {p.bpm} bpm
                  </span>
                  <button
                    type="button"
                    class="icon-btn strand-remove"
                    aria-label={`„${p.name}“ an Position ${k + 1} entfernen`}
                    title="Entfernen"
                    onClick={() => onEdit((a) => removeItem(a, entry.index))}
                  >
                    <Icon name="close" size={16} />
                  </button>
                  <span class="strand-progress" aria-hidden="true" />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
