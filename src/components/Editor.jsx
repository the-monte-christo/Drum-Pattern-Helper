import { LAYERS, LIMITS, clearLayer, setLayerSubdivisions, setSubdivision } from '../../shared/pattern.js';
import { Icon, Stepper } from './ui.jsx';

const LABEL = Object.fromEntries(LAYERS.map((l) => [l.key, l.label]));
const SUB_OPTIONS = Array.from({ length: LIMITS.subMax }, (_, i) => i + 1);

export function Editor({ pattern, onEdit }) {
  const beats = Array.from({ length: pattern.beats }, (_, b) => b);

  return (
    <section class="panel" aria-labelledby="editor-title">
      <div class="panel-head">
        <h2 class="section-title" id="editor-title">Editor</h2>
        <span class="panel-hint">Schläge pro Zählzeit je Layer</span>
      </div>
      <div class="scroller">
        <div
          class="lane-grid editor-grid"
          style={{ '--beats': pattern.beats, '--track-min': `${pattern.beats * 116}px` }}
        >
          {pattern.layers.map((layer) => {
            const uniform = layer.subdivisions.every((s) => s === layer.subdivisions[0]);
            return (
              <div class={`lane l-${layer.key}`} key={layer.key}>
                <div class="lane-label">
                  <span class="lane-chip" aria-hidden="true" />
                  <span class="lane-name">{LABEL[layer.key]}</span>
                </div>
                <div class="track">
                  {beats.map((b) => (
                    <div class="beat beat--editor" key={b}>
                      <Stepper
                        compact
                        label={`${LABEL[layer.key]}, Schläge auf Zählzeit ${b + 1}`}
                        value={layer.subdivisions[b]}
                        min={LIMITS.subMin}
                        max={LIMITS.subMax}
                        onChange={(n) => onEdit((p) => setSubdivision(p, layer.key, b, n))}
                      />
                    </div>
                  ))}
                </div>
                <div class="lane-side lane-side--editor">
                  <select
                    class="select"
                    aria-label={`${LABEL[layer.key]}: alle Zählzeiten setzen`}
                    value={uniform ? String(layer.subdivisions[0]) : ''}
                    onChange={(e) => {
                      const n = Number(e.currentTarget.value);
                      if (n) onEdit((p) => setLayerSubdivisions(p, layer.key, n));
                    }}
                  >
                    {!uniform && <option value="">Alle …</option>}
                    {SUB_OPTIONS.map((n) => (
                      <option value={n} key={n}>
                        Alle: {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    class="icon-btn"
                    title="Alle Schläge des Layers löschen"
                    aria-label={`${LABEL[layer.key]}: alle Schläge löschen`}
                    onClick={() => onEdit((p) => clearLayer(p, layer.key))}
                  >
                    <Icon name="clear" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
