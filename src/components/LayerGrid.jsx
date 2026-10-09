import { useRef } from 'preact/hooks';
import { HIT, LAYERS, cycleHit, hitLevel, nextHit, updateLayer } from '../../shared/pattern.js';
import { Icon, useAnimationFrame } from './ui.jsx';

const LABEL = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

// Zählsilben als Orientierung in leeren Platzhaltern.
const SYLLABLES = { 2: ['+'], 3: ['tri', 'let'], 4: ['e', '+', 'a'], 6: ['', '', '+', '', ''] };

function slotLabel(beat, index, sub) {
  if (index === 0) return String(beat + 1);
  return SYLLABLES[sub]?.[index - 1] ?? '';
}

const SLOT_MIN = 26; // px – Platzhalter bleiben antippbar, notfalls scrollt das Raster.
const FOLLOW_MARGIN = 12; // px Abstand des Playheads zum linken Rand nach dem Mitscrollen

export function trackMinWidth(pattern) {
  const maxSub = Math.max(...pattern.layers.flatMap((l) => l.subdivisions));
  return pattern.beats * Math.max(64, maxSub * SLOT_MIN + 8);
}

const SLOT_STATE = {
  [HIT.OFF]: { cls: '', pressed: 'false', text: '' },
  [HIT.ON]: { cls: ' is-on', pressed: 'true', text: '' },
  [HIT.GHOST]: { cls: ' is-ghost', pressed: 'mixed', text: ', Ghost Note' },
};

// Läuft der Playhead aus dem sichtbaren Bereich, blättert die Ansicht weiter
// (bei der Wiederholung zurück zum Anfang).
function followPlayhead(scroller, grid, ruler, ratio) {
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  const labelW = ruler.offsetLeft; // feste Namensspalte links
  const sideW = grid.offsetWidth - labelW - ruler.offsetWidth; // feste Lautstärke-Spalte rechts (oder Rand)
  const x = labelW + ratio * ruler.offsetWidth;
  const viewStart = scroller.scrollLeft + labelW;
  const viewEnd = scroller.scrollLeft + scroller.clientWidth - sideW;
  if (x < viewStart || x > viewEnd - FOLLOW_MARGIN) scroller.scrollLeft = x - labelW - FOLLOW_MARGIN;
}

export function LayerGrid({ pattern, engine, playing, solo, showVolume, onToggleVolume, onToggleSolo, onEdit }) {
  const scrollerRef = useRef(null);
  const gridRef = useRef(null);
  const rulerRef = useRef(null);
  const playheadRef = useRef(null);
  const nowBeat = useRef(-1);

  const markBeat = (beat) => {
    if (beat === nowBeat.current || !gridRef.current) return;
    for (const el of gridRef.current.querySelectorAll('.is-now')) el.classList.remove('is-now');
    if (beat >= 0) for (const el of gridRef.current.querySelectorAll(`[data-b="${beat}"]`)) el.classList.add('is-now');
    nowBeat.current = beat;
  };

  // Playhead läuft per transform am Render-Zyklus vorbei – keine Re-Renders während der Wiedergabe.
  useAnimationFrame(playing, (active) => {
    const el = playheadRef.current;
    if (!el) return;
    const pos = active ? engine.position() : null;
    if (!pos) {
      el.style.opacity = '0';
      markBeat(-1);
      return;
    }
    const ratio = (pos.beat + pos.frac) / pattern.beats;
    el.style.opacity = '1';
    el.style.transform = `translateX(${ratio * 100}%)`;
    markBeat(pos.beat);
    if (scrollerRef.current && rulerRef.current) followPlayhead(scrollerRef.current, gridRef.current, rulerRef.current, ratio);
  });

  const beats = Array.from({ length: pattern.beats }, (_, b) => b);
  const visible = pattern.layers.filter((l) => !l.hidden);
  const hiddenCount = pattern.layers.length - visible.length;

  const tap = (key, beat, index, value) => {
    onEdit((p) => cycleHit(p, key, beat, index));
    const next = nextHit(value);
    if (next !== HIT.OFF && !playing) engine.preview(key, hitLevel(next));
  };

  return (
    <section class="panel" aria-labelledby="layers-title">
      <div class="panel-head">
        <h2 class="section-title" id="layers-title">Layer</h2>
        <span class="panel-hint">Antippen: Schlag · nochmal: Ghost Note · nochmal: leer</span>
        <div class="panel-head-actions">
          {hiddenCount > 0 && (
            <span class="panel-note">{hiddenCount} Layer ausgeblendet</span>
          )}
          <button
            type="button"
            class="pill-toggle"
            aria-pressed={showVolume}
            title="Lautstärke-Regler ein-/ausblenden"
            onClick={onToggleVolume}
          >
            <Icon name="volume" size={18} />
            <span>Lautstärke</span>
          </button>
        </div>
      </div>
      <div class="scroller" ref={scrollerRef}>
        <div
          class={`lane-grid layer-grid${showVolume ? '' : ' lane-grid--no-side'}`}
          ref={gridRef}
          style={{ '--beats': pattern.beats, '--track-min': `${trackMinWidth(pattern)}px` }}
        >
          <div class="lane-label lane-label--ruler" />
          <div class="ruler" ref={rulerRef}>
            {beats.map((b) => (
              <div class="ruler-beat" data-b={b} key={b}>
                {b + 1}
              </div>
            ))}
          </div>
          {showVolume && <div class="lane-side lane-side--ruler">Lautstärke</div>}

          {visible.map((layer) => {
            const muted = layer.muted;
            const soloed = solo.has(layer.key);
            const silent = muted || (solo.size > 0 && !soloed);
            const name = LABEL[layer.key].label;
            return (
              <div class={`lane l-${layer.key}${silent ? ' is-silent' : ''}`} key={layer.key}>
                <div class="lane-label">
                  <span class="lane-chip" aria-hidden="true" />
                  <span class="lane-name">{name}</span>
                  <span class="lane-toggles">
                    <button
                      type="button"
                      class="toggle toggle--mute"
                      aria-pressed={muted}
                      aria-label={`${name} stummschalten`}
                      onClick={() => onEdit((p) => updateLayer(p, layer.key, { muted: !muted }))}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      class="toggle toggle--solo"
                      aria-pressed={soloed}
                      aria-label={`${name} solo`}
                      onClick={() => onToggleSolo(layer.key)}
                    >
                      S
                    </button>
                  </span>
                </div>

                <div class="track">
                  {beats.map((b) => {
                    const sub = layer.subdivisions[b];
                    const hits = layer.hits[b];
                    return (
                      <div class="beat" data-b={b} key={b} style={{ '--sub': sub }}>
                        {hits.map((value, i) => {
                          const state = SLOT_STATE[value] ?? SLOT_STATE[HIT.OFF];
                          return (
                            <button
                              type="button"
                              key={`${sub}-${i}`}
                              class={`slot${state.cls}`}
                              aria-pressed={state.pressed}
                              aria-label={`${name}, Zählzeit ${b + 1}, Schlag ${i + 1} von ${sub}${state.text}`}
                              onClick={() => tap(layer.key, b, i, value)}
                            >
                              <span class="slot-label">{slotLabel(b, i, sub)}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {showVolume && (
                  <div class="lane-side">
                    <input
                      class="slider volume-slider"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(layer.volume * 100)}
                      aria-label={`Lautstärke ${name}`}
                      onInput={(e) => {
                        const volume = Number(e.currentTarget.value) / 100;
                        onEdit((p) => updateLayer(p, layer.key, { volume }));
                      }}
                    />
                    <output class="volume-readout">{Math.round(layer.volume * 100)}</output>
                  </div>
                )}
              </div>
            );
          })}

          <div class="playhead-lane" aria-hidden="true">
            <div class="playhead" ref={playheadRef} />
          </div>
        </div>
        {visible.length === 0 && <p class="empty-hint">Alle Layer sind ausgeblendet – im Editor wieder einblenden.</p>}
      </div>
    </section>
  );
}
