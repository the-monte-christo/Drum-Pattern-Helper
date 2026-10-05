// Synthetisierte Klänge – keine Samples nötig, damit die App klein und offline-fähig bleibt.
// Jede Stimme gibt ihre Quell-Nodes zurück, damit die Engine sie bei Stop abbrechen kann.

export function createNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ctx, t, peak, decay, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out);
  return g;
}

function noise(ctx, noiseBuffer, t, duration) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration);
  return src;
}

function tone(ctx, type, freq, t, duration) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.start(t);
  osc.stop(t + duration);
  return osc;
}

function click(freq) {
  return (ctx, out, t) => {
    const osc = tone(ctx, 'sine', freq, t, 0.06);
    osc.connect(envelope(ctx, t, 0.9, 0.05, out));
    return [osc];
  };
}

export const VOICES = {
  metro_high: click(1760),
  metro_low: click(1100),

  hihat(ctx, out, t, noiseBuffer) {
    const src = noise(ctx, noiseBuffer, t, 0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 0.8;
    src.connect(hp).connect(bp).connect(envelope(ctx, t, 0.7, 0.06, out));
    return [src];
  },

  snare(ctx, out, t, noiseBuffer) {
    const src = noise(ctx, noiseBuffer, t, 0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    src.connect(hp).connect(envelope(ctx, t, 0.8, 0.2, out));

    const body = tone(ctx, 'triangle', 190, t, 0.15);
    body.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    body.connect(envelope(ctx, t, 0.6, 0.12, out));
    return [src, body];
  },

  kick(ctx, out, t) {
    const osc = tone(ctx, 'sine', 160, t, 0.5);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    osc.connect(envelope(ctx, t, 1, 0.45, out));
    return [osc];
  },
};
