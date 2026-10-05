import { useRef } from 'preact/hooks';
import { LIMITS, clamp, setBeats } from '../../shared/pattern.js';
import { Icon, Stepper } from './ui.jsx';

const STATUS_TEXT = {
  loading: 'Lädt …',
  saving: 'Speichert …',
  saved: 'Gespeichert',
  error: 'Nicht gespeichert – neuer Versuch läuft',
  offline: 'Offline',
};

function useTapTempo(onTempo) {
  const taps = useRef([]);
  return () => {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t < 2500);
    recent.push(now);
    taps.current = recent.slice(-6);
    if (taps.current.length < 2) return;
    const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    onTempo(Math.round(60000 / avg));
  };
}

export function PatternHeader({ pattern, status, onEdit, onDuplicate, onDelete, onOpenList }) {
  const setBpm = (bpm) => onEdit((p) => ({ ...p, bpm: clamp(bpm, LIMITS.bpmMin, LIMITS.bpmMax) }));
  const tap = useTapTempo(setBpm);

  return (
    <header class="pattern-header">
      <div class="header-row">
        <button type="button" class="icon-btn drawer-open" aria-label="Pattern-Liste öffnen" onClick={onOpenList}>
          <Icon name="menu" />
        </button>
        <label class="name-field">
          <span class="field-label">Pattern</span>
          <input
            class="name-input"
            type="text"
            value={pattern.name}
            maxLength={LIMITS.nameMax}
            spellcheck={false}
            onInput={(e) => onEdit((p) => ({ ...p, name: e.currentTarget.value }))}
            onBlur={(e) => {
              if (!e.currentTarget.value.trim()) onEdit((p) => ({ ...p, name: 'Neues Pattern' }));
            }}
          />
        </label>
        <div class="header-actions">
          <span class={`save-status save-status--${status}`} role="status">
            {STATUS_TEXT[status]}
          </span>
          <button type="button" class="icon-btn" aria-label="Pattern duplizieren" title="Duplizieren" onClick={onDuplicate}>
            <Icon name="copy" />
          </button>
          <button type="button" class="icon-btn icon-btn--danger" aria-label="Pattern löschen" title="Löschen" onClick={onDelete}>
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div class="header-row header-row--controls">
        <div class="field">
          <span class="field-label">Taktart</span>
          <Stepper
            label="Zählzeiten pro Takt"
            value={pattern.beats}
            min={LIMITS.beatsMin}
            max={LIMITS.beatsMax}
            display={`${pattern.beats}/4`}
            onChange={(n) => onEdit((p) => setBeats(p, n))}
          />
        </div>

        <div class="field field--tempo">
          <span class="field-label">Tempo</span>
          <div class="tempo">
            <button type="button" class="stepper-btn" aria-label="Tempo verringern" onClick={() => setBpm(pattern.bpm - 1)}>
              <Icon name="minus" size={16} />
            </button>
            <input
              class="slider tempo-slider"
              type="range"
              min={LIMITS.bpmMin}
              max={LIMITS.bpmMax}
              value={pattern.bpm}
              aria-label="Tempo in BPM"
              onInput={(e) => setBpm(Number(e.currentTarget.value))}
            />
            <button type="button" class="stepper-btn" aria-label="Tempo erhöhen" onClick={() => setBpm(pattern.bpm + 1)}>
              <Icon name="plus" size={16} />
            </button>
            <output class="bpm-readout">
              {pattern.bpm}
              <small>BPM</small>
            </output>
            <button type="button" class="btn btn--small tap-btn" onClick={tap}>
              Tap
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
