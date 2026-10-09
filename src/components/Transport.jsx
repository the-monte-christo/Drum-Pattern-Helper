import { useRef } from 'preact/hooks';
import { Icon, useAnimationFrame } from './ui.jsx';

export function Transport({ engine, playing, disabled = false, onTogglePlay, master, onMaster, sub }) {
  const counterRef = useRef(null);
  const last = useRef('');

  useAnimationFrame(playing, (active) => {
    const pos = active ? engine.position() : null;
    const text = pos ? `${String(pos.bar + 1).padStart(3, '0')}.${pos.beat + 1}` : `001.1`;
    if (text !== last.current && counterRef.current) {
      counterRef.current.textContent = text;
      last.current = text;
    }
  });

  return (
    <footer class="transport">
      <div class="lcd" aria-label="Position (Takt.Zählzeit)">
        <span class="lcd-label">Takt.Zz</span>
        <span class="lcd-value" ref={counterRef}>
          001.1
        </span>
        <span class="lcd-sub">{sub}</span>
      </div>

      <label class="master">
        <Icon name="volume" />
        <span class="visually-hidden">Gesamtlautstärke</span>
        <input
          class="slider master-slider"
          type="range"
          min="0"
          max="100"
          value={Math.round(master * 100)}
          onInput={(e) => onMaster(Number(e.currentTarget.value) / 100)}
        />
      </label>

      <button
        type="button"
        class={`play-btn${playing ? ' is-playing' : ''}`}
        aria-pressed={playing}
        disabled={disabled && !playing}
        onClick={onTogglePlay}
        title="Abspielen / Stopp (Leertaste)"
      >
        <Icon name={playing ? 'stop' : 'play'} size={26} />
        <span>{playing ? 'Stopp' : 'Abspielen'}</span>
      </button>
    </footer>
  );
}
