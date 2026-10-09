import { useRef } from 'preact/hooks';
import { LIMITS, clamp, setBeats } from '../../shared/pattern.js';
import { HeaderTitle } from './HeaderTitle.jsx';
import { TagEditor } from './Tags.jsx';
import { Icon, Stepper } from './ui.jsx';

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

function TempoButton({ step, bpm, onTempo }) {
  const verb = step < 0 ? 'verringern' : 'erhöhen';
  const big = Math.abs(step) > 1;
  return (
    <button
      type="button"
      class={`stepper-btn${big ? ' stepper-btn--text' : ''}`}
      aria-label={`Tempo um ${Math.abs(step)} ${verb}`}
      onClick={() => onTempo(bpm + step)}
    >
      {big ? `${step > 0 ? '+' : '−'}${Math.abs(step)}` : <Icon name={step < 0 ? 'minus' : 'plus'} size={16} />}
    </button>
  );
}

export function PatternHeader({ pattern, status, tagSuggestions, onEdit, onDuplicate, onDelete }) {
  const setBpm = (bpm) => onEdit((p) => ({ ...p, bpm: clamp(bpm, LIMITS.bpmMin, LIMITS.bpmMax) }));
  const tap = useTapTempo(setBpm);

  return (
    <header class="pattern-header">
      <HeaderTitle
        kind="Pattern"
        name={pattern.name}
        maxLength={LIMITS.nameMax}
        fallbackName="Neues Pattern"
        status={status}
        onRename={(name) => onEdit((p) => ({ ...p, name }))}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

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
            <TempoButton step={-5} bpm={pattern.bpm} onTempo={setBpm} />
            <TempoButton step={-1} bpm={pattern.bpm} onTempo={setBpm} />
            <input
              class="slider tempo-slider"
              type="range"
              min={LIMITS.bpmMin}
              max={LIMITS.bpmMax}
              value={pattern.bpm}
              aria-label="Tempo in BPM"
              onInput={(e) => setBpm(Number(e.currentTarget.value))}
            />
            <TempoButton step={1} bpm={pattern.bpm} onTempo={setBpm} />
            <TempoButton step={5} bpm={pattern.bpm} onTempo={setBpm} />
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

      <div class="header-row">
        <TagEditor tags={pattern.tags} suggestions={tagSuggestions} onChange={(tags) => onEdit((p) => ({ ...p, tags }))} />
      </div>
    </header>
  );
}
