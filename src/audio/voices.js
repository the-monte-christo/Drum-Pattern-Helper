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
  src.loop = true; // lange Klänge (offene Hi-Hat) überschreiten sonst das Pufferende
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

// Tom: Sinus mit Pitch-Abfall plus kurzer Anschlag.
function tom(freq, endFreq, decay) {
  return (ctx, out, t, noiseBuffer) => {
    const osc = tone(ctx, 'sine', freq, t, decay + 0.05);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + decay * 0.8);
    osc.connect(envelope(ctx, t, 0.95, decay, out));

    const src = noise(ctx, noiseBuffer, t, 0.03);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    src.connect(lp).connect(envelope(ctx, t, 0.25, 0.025, out));
    return [osc, src];
  };
}

// Maximaler Ausklang der offenen Hi-Hat (s); der nächste Hi-Hat-Schlag dämpft sie früher ab.
export const OPEN_HAT_RING = 0.9;

export const VOICES = {
  metro_high: click(1760),
  metro_low: click(1100),

  hihat_open(ctx, out, t, noiseBuffer) {
    const src = noise(ctx, noiseBuffer, t, OPEN_HAT_RING);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 9000;
    bp.Q.value = 0.6;
    src.connect(hp).connect(bp).connect(envelope(ctx, t, 0.6, OPEN_HAT_RING, out));
    return [src];
  },

  tom_high: tom(240, 170, 0.32),
  tom_mid: tom(175, 120, 0.38),
  tom_low: tom(120, 80, 0.45),

  // Zwei verstimmte Rechtecke durch einen Bandpass (angelehnt an die TR-808).
  cowbell(ctx, out, t) {
    const a = tone(ctx, 'square', 540, t, 0.35);
    const b = tone(ctx, 'square', 800, t, 0.35);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.9;
    a.connect(bp);
    b.connect(bp);
    bp.connect(envelope(ctx, t, 0.5, 0.3, out));
    return [a, b];
  },

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
