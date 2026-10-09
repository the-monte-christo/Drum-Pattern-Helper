import { useId, useState } from 'preact/hooks';
import { TAG_LIMITS, normalizeTag, normalizeTags, sameTag } from '../../shared/tags.js';
import { Icon } from './ui.jsx';

// Tags eines Pattern/Arrangements bearbeiten: Enter oder Komma fügt hinzu, Rücktaste im leeren Feld entfernt den letzten.
export function TagEditor({ tags, suggestions, onChange }) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const open = suggestions.filter((s) => !tags.some((t) => sameTag(t, s)));

  const add = (value) => {
    const tag = normalizeTag(value);
    if (tag) onChange(normalizeTags([...tags, tag]));
    setDraft('');
  };

  return (
    <div class="tag-editor" role="group" aria-label="Tags">
      <span class="field-label">Tags</span>
      <ul class="chips">
        {tags.map((tag) => (
          <li class="chip chip--static" key={tag}>
            {tag}
            <button
              type="button"
              class="chip-x"
              aria-label={`Tag „${tag}“ entfernen`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
        {tags.length < TAG_LIMITS.tagsMax && (
          <li>
            <input
              class="tag-input"
              type="text"
              placeholder="+ Tag"
              aria-label="Tag hinzufügen"
              list={listId}
              value={draft}
              maxLength={TAG_LIMITS.tagMax}
              spellcheck={false}
              onInput={(e) => {
                const value = e.currentTarget.value;
                // Auswahl aus der Vorschlagsliste direkt übernehmen.
                const picked = !e.inputType || e.inputType === 'insertReplacementText';
                if (picked && open.some((s) => s === value)) add(value);
                else setDraft(value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  add(draft);
                } else if (e.key === 'Backspace' && !draft && tags.length) {
                  onChange(tags.slice(0, -1));
                }
              }}
              onBlur={() => add(draft)}
            />
          </li>
        )}
      </ul>
      <datalist id={listId}>
        {open.map((s) => (
          <option value={s} key={s} />
        ))}
      </datalist>
    </div>
  );
}

// Alle vorhandenen Tags als Filter-Chips; aktive Tags müssen alle zutreffen.
export function TagFilter({ tags, active, onToggle, onClear }) {
  if (!tags.length) return null;
  return (
    <div class="tag-filter" role="group" aria-label="Nach Tags filtern">
      {tags.map((tag) => (
        <button
          type="button"
          class="chip"
          key={tag}
          aria-pressed={active.some((t) => sameTag(t, tag))}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
      {active.length > 0 && (
        <button type="button" class="chip chip--clear" onClick={onClear}>
          Alle zeigen
        </button>
      )}
    </div>
  );
}
