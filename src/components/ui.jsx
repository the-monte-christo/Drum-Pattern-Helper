import { useEffect, useRef } from 'preact/hooks';

const ICONS = {
  play: 'M7 4.5v15l13-7.5z',
  stop: 'M6 6h12v12H6z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  minus: 'M5 11h14v2H5z',
  copy: 'M8 3h11v13h-2V5H8zM5 7h10v14H5zm2 2v10h6V9z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7zm4 2v8h1v-8zm3 0v8h1v-8z',
  menu: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  clear: 'M15.5 4 21 9.5 11.5 19H6l-3-3zM9 9.5 5.8 12.7 8.3 15.2h2.4l1.8-1.8z',
  volume: 'M4 9h4l5-4v14l-5-4H4zm12.5-1.5a6 6 0 0 1 0 9l-1.4-1.4a4 4 0 0 0 0-6.2z',
};

// Linien-Icons (gezeichnet mit stroke statt fill).
const LINE_ICONS = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M4 4l16 16M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.3 6.4C3.6 8.2 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.7-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  chevron: 'M6 9l6 6 6-6',
  swap: 'M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4',
};

export function Icon({ name, size = 20 }) {
  const line = LINE_ICONS[name];
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {line ? (
        <path d={line} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ) : (
        <path d={ICONS[name]} fill="currentColor" />
      )}
    </svg>
  );
}

export function Stepper({ value, min, max, onChange, label, display, compact = false }) {
  return (
    <div class={`stepper${compact ? ' stepper--compact' : ''}`} role="group" aria-label={label}>
      <button
        type="button"
        class="stepper-btn"
        aria-label={`${label} verringern`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" size={16} />
      </button>
      <output class="stepper-value">{display ?? value}</output>
      <button
        type="button"
        class="stepper-btn"
        aria-label={`${label} erhöhen`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

// Ruft callback(true) in jedem Frame auf, solange active ist, und einmal callback(false) beim Beenden.
export function useAnimationFrame(active, callback) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    if (!active) {
      cb.current(false);
      return undefined;
    }
    let id;
    const loop = () => {
      cb.current(true);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
