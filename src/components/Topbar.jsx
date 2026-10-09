import { Icon } from './ui.jsx';

const TABS = [
  ['patterns', 'Pattern'],
  ['arrangements', 'Arrangement'],
];

// Kopfleiste: Liste ein-/ausblenden, Marke und Wechsel zwischen den Ebenen.
export function Topbar({ tab, onTab, onToggleList, listVisible }) {
  return (
    <header class="topbar">
      <button
        type="button"
        class="icon-btn list-toggle"
        aria-label={listVisible ? 'Liste ausblenden' : 'Liste einblenden'}
        aria-expanded={listVisible}
        title="Liste ein-/ausblenden"
        onClick={onToggleList}
      >
        <Icon name="menu" />
      </button>
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <span class="brand-name">Drum Pattern Helper</span>
      </div>
      <div class="tabs" role="tablist" aria-label="Ebene">
        {TABS.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            class="tab"
            key={key}
            aria-selected={tab === key}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
