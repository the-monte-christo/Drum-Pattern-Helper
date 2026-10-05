import { LAYER_KEYS, beatEvents } from '../../shared/pattern.js';
import { VOICES, createNoiseBuffer } from './voices.js';

// Zählzeiten werden komplett vorausgeplant, sobald ihr Start in dieses Fenster fällt.
// Tempo- und Pattern-Änderungen greifen damit ab der nächsten Zählzeit.
const SCHEDULE_AHEAD = 0.12;

export class AudioEngine {
  ctx = null;
  pattern = null;
  solo = new Set();
  masterVolume = 0.9;
  playing = false;
  beat = 0;
  bar = 0;
  nextBeatTime = 0;
  timeline = []; // geplante Zählzeiten { bar, beat, time, duration } für die Playhead-Anzeige
  sources = []; // geplante Quell-Nodes { node, end } für sofortigen Stop

  constructor() {
    this.worker = new Worker(new URL('./ticker.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => this.tick();
  }

  ensureContext() {
    if (!this.ctx) {
      // iOS/iPadOS: Wiedergabe auch im Lautlos-Modus erlauben.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 12;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(limiter);
      this.layerGains = Object.fromEntries(
        LAYER_KEYS.map((key) => {
          const g = ctx.createGain();
          g.connect(this.master);
          return [key, g];
        }),
      );
      this.noiseBuffer = createNoiseBuffer(ctx);
      this.ctx = ctx;
      this.applyGains(true);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    return this.ctx;
  }

  setPattern(pattern) {
    this.pattern = pattern;
    if (pattern && this.beat >= pattern.beats) this.beat = 0;
    this.applyGains();
  }

  setSolo(solo) {
    this.solo = solo;
    this.applyGains();
  }

  setMasterVolume(v) {
    this.masterVolume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  layerLevel(layer) {
    if (layer.muted) return 0;
    if (this.solo.size > 0 && !this.solo.has(layer.key)) return 0;
    return layer.volume;
  }

  applyGains(immediate = false) {
    if (!this.ctx || !this.pattern) return;
    const now = this.ctx.currentTime;
    for (const layer of this.pattern.layers) {
      const param = this.layerGains[layer.key].gain;
      const level = this.layerLevel(layer);
      if (immediate) param.value = level;
      else param.setTargetAtTime(level, now, 0.01);
    }
  }

  // Einzelnen Schlag direkt anspielen (Feedback beim Setzen einer Note).
  preview(key) {
    const ctx = this.ensureContext();
    const layer = this.pattern?.layers.find((l) => l.key === key);
    // Vorhören ignoriert Mute/Solo, respektiert aber die Layer-Lautstärke.
    const g = ctx.createGain();
    g.gain.value = layer ? layer.volume : 1;
    g.connect(this.master);
    VOICES[key](ctx, g, ctx.currentTime + 0.005, this.noiseBuffer);
  }

  start() {
    if (this.playing || !this.pattern) return;
    const ctx = this.ensureContext();
    this.playing = true;
    this.beat = 0;
    this.bar = 0;
    this.nextBeatTime = ctx.currentTime + 0.08;
    this.timeline = [];
    this.tick();
    this.worker.postMessage('start');
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.worker.postMessage('stop');
    const now = this.ctx.currentTime;
    for (const { node, end } of this.sources) {
      if (end > now) {
        try {
          node.stop();
        } catch {
          // Node war noch nicht gestartet bzw. schon gestoppt.
        }
      }
    }
    this.sources = [];
    this.timeline = [];
  }

  tick() {
    if (!this.playing || !this.pattern) return;
    const now = this.ctx.currentTime;
    // Bei stark verzögertem Tick (z. B. Tab im Hintergrund) nicht nachholen, sondern neu ansetzen.
    if (this.nextBeatTime < now - 0.2) this.nextBeatTime = now + 0.05;

    while (this.nextBeatTime < now + SCHEDULE_AHEAD) {
      const p = this.pattern;
      if (this.beat >= p.beats) this.beat = 0;
      const duration = 60 / p.bpm;
      this.scheduleBeat(p, this.beat, this.nextBeatTime, duration);
      this.timeline.push({ bar: this.bar, beat: this.beat, time: this.nextBeatTime, duration });
      this.nextBeatTime += duration;
      this.beat += 1;
      if (this.beat >= p.beats) {
        this.beat = 0;
        this.bar += 1;
      }
    }

    this.sources = this.sources.filter((s) => s.end > now);
    while (this.timeline.length > 1 && this.timeline[1].time <= now) this.timeline.shift();
  }

  scheduleBeat(pattern, beat, time, duration) {
    for (const { key, frac } of beatEvents(pattern, beat)) {
      const t = time + frac * duration;
      const nodes = VOICES[key](this.ctx, this.layerGains[key], t, this.noiseBuffer);
      for (const node of nodes) this.sources.push({ node, end: t + 0.6 });
    }
  }

  // Aktuelle Position für die Anzeige: Zählzeit + Fortschritt innerhalb der Zählzeit.
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    let current = null;
    for (const entry of this.timeline) {
      if (entry.time <= now) current = entry;
      else break;
    }
    if (!current) return null;
    return { bar: current.bar, beat: current.beat, frac: Math.min(1, (now - current.time) / current.duration) };
  }
}
