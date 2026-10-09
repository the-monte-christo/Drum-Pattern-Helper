import { Icon } from './ui.jsx';

const STATUS_TEXT = {
  loading: 'Lädt …',
  saving: 'Speichert …',
  saved: 'Gespeichert',
  error: 'Nicht gespeichert – neuer Versuch läuft',
  offline: 'Offline',
};

// Kopfzeile für Pattern und Arrangements: Name, Speicherstatus, Duplizieren, Löschen.
export function HeaderTitle({ kind, name, maxLength, fallbackName, status, onRename, onDuplicate, onDelete }) {
  return (
    <div class="header-row">
      <label class="name-field">
        <span class="field-label">{kind}</span>
        <input
          class="name-input"
          type="text"
          value={name}
          maxLength={maxLength}
          spellcheck={false}
          onInput={(e) => onRename(e.currentTarget.value)}
          onBlur={(e) => {
            if (!e.currentTarget.value.trim()) onRename(fallbackName);
          }}
        />
      </label>
      <div class="header-actions">
        <span class={`save-status save-status--${status}`} role="status">
          {STATUS_TEXT[status]}
        </span>
        <button type="button" class="icon-btn" aria-label={`${kind} duplizieren`} title="Duplizieren" onClick={onDuplicate}>
          <Icon name="copy" />
        </button>
        <button
          type="button"
          class="icon-btn icon-btn--danger"
          aria-label={`${kind} löschen`}
          title="Löschen"
          onClick={onDelete}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}
