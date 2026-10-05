import { useRef } from 'preact/hooks';
import { LAYERS, toggleHit, updateLayer } from '../../shared/pattern.js';
import { useAnimationFrame } from './ui.jsx';

const LABEL = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

// Zählsilben als Orientierung in leeren Platzhaltern.
const SYLLABLES = { 2: ['+'], 3: ['tri', 'let'], 4: ['e', '+', 'a'], 6: ['', '', '+', '', ''] };

function slotLabel(beat, index, sub) {
  if (index === 0) return String(beat + 1);
  return SYLLABLES[sub]?.[index - 1] ?? '';
}

const SLOT_MIN = 26; // px – Platzhalter bleiben antippbar, notfalls scrollt das Raster.

export function trackMinWidth(pattern) {
  const maxSub = Math.max(...pattern.layers.flatMap((l) => l.subdivisions));
  return pattern.beats * Math.max(64, maxSub * SLOT_MIN + 8);
}

export function LayerGrid({ pattern, engine, playing, solo, onToggleSolo, onEdit }) {
  const gridRef = useRef(null);
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
    el.style.opacity = '1';
    el.style.transform = `translateX(${((pos.beat + pos.frac) / pattern.beats) * 100}%)`;
    markBeat(pos.beat);
  });

  const beats = Array.from({ length: pattern.beats }, (_, b) => b);
  const toggle = (key, beat, index, wasOn) => {
    onEdit((p) => toggleHit(p, key, beat, index));
    if (!wasOn && !playing) engine.preview(key);
  };

  return (
    <section class="panel" aria-labelledby="layers-title">
      <div class="panel-head">
        <h2 class="section-title" id="layers-title">Layer</h2>
        <span class="panel-hint">Platzhalter antippen, um einen Schlag zu setzen</span>
      </div>
      <div class="scroller">
        <div
          class="lane-grid layer-grid"
          ref={gridRef}
          style={{ '--beats': pattern.beats, '--track-min': `${trackMinWidth(pattern)}px` }}
        >
          <div class="lane-label lane-label--ruler" />
          <div class="ruler">
            {beats.map((b) => (
              <div class="ruler-beat" data-b={b} key={b}>
                {b + 1}
              </div>
            ))}
          </div>
          <div class="lane-side lane-side--ruler">Lautstärke</div>

          {pattern.layers.map((layer) => {
            const muted = layer.muted;
            const soloed = solo.has(layer.key);
            const silent = muted || (solo.size > 0 && !soloed);
            return (
              <div class={`lane l-${layer.key}${silent ? ' is-silent' : ''}`} key={layer.key}>
                <div class="lane-label">
                  <span class="lane-chip" aria-hidden="true" />
                  <span class="lane-name">{LABEL[layer.key].label}</span>
                  <span class="lane-toggles">
                    <button
                      type="button"
                      class="toggle toggle--mute"
                      aria-pressed={muted}
                      aria-label={`${LABEL[layer.key].label} stummschalten`}
                      onClick={() => onEdit((p) => updateLayer(p, layer.key, { muted: !muted }))}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      class="toggle toggle--solo"
                      aria-pressed={soloed}
                      aria-label={`${LABEL[layer.key].label} solo`}
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
                        {hits.map((on, i) => (
                          <button
                            type="button"
                            key={`${sub}-${i}`}
                            class={`slot${on ? ' is-on' : ''}`}
                            aria-pressed={!!on}
                            aria-label={`${LABEL[layer.key].label}, Zählzeit ${b + 1}, Schlag ${i + 1} von ${sub}`}
                            onClick={() => toggle(layer.key, b, i, on)}
                          >
                            <span class="slot-label">{slotLabel(b, i, sub)}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div class="lane-side">
                  <input
                    class="slider volume-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(layer.volume * 100)}
                    aria-label={`Lautstärke ${LABEL[layer.key].label}`}
                    onInput={(e) => {
                      const volume = Number(e.currentTarget.value) / 100;
                      onEdit((p) => updateLayer(p, layer.key, { volume }));
                    }}
                  />
                  <output class="volume-readout">{Math.round(layer.volume * 100)}</output>
                </div>
              </div>
            );
          })}

          <div class="playhead-lane" aria-hidden="true">
            <div class="playhead" ref={playheadRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
