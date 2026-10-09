import { LAYER_KEYS, beatEvents } from '../../shared/pattern.js';
import { OPEN_HAT_RING, VOICES, createNoiseBuffer } from './voices.js';

// Zählzeiten werden komplett vorausgeplant, sobald ihr Start in dieses Fenster fällt.
// Tempo- und Pattern-Änderungen greifen damit ab der nächsten Zählzeit.
const SCHEDULE_AHEAD = 0.12;
// So lange bleibt ein geplanter Klang per stop() abbrechbar (längster Ausklang).
const RELEASE = 1.2;
// Abdämpfzeit der offenen Hi-Hat (kurz, aber ohne Knacksen).
const CHOKE_TIME = 0.02;
// Diese Layer dämpfen eine klingende offene Hi-Hat ab.
const CHOKERS = new Set(['hihat', 'hihat_open']);

export class AudioEngine {
  ctx = null;
  sequence = []; // Pattern in Abspielreihenfolge – Pattern-Ansicht: genau eins, Arrangement: alle
  solo = new Set();
  masterVolume = 0.9;
  playing = false;
  item = 0; // Position in sequence
  beat = 0;
  bar = 0;
  nextBeatTime = 0;
  timeline = []; // geplante Zählzeiten { item, bar, beat, beats, time, duration } für die Anzeige
  sources = []; // geplante Quell-Nodes { node, end } für sofortigen Stop
  openHats = []; // klingende offene Hi-Hats { gain, start, end }
  gainPattern = null; // Pattern, dessen Layer-Lautstärken gerade gelten

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

  get hasContent() {
    return this.sequence.length > 0;
  }

  setSequence(patterns) {
    this.sequence = patterns;
    if (this.item >= patterns.length) {
      this.item = 0;
      this.beat = 0;
    }
    // Neue Fassung des gerade klingenden Pattern (z. B. Lautstärke geändert) sofort übernehmen.
    const current = this.gainPattern && patterns.find((p) => p.id === this.gainPattern.id);
    if (current) this.gainPattern = current;
    else if (!this.playing) this.gainPattern = patterns[0] ?? null;
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
    if (!this.ctx || !this.gainPattern) return;
    const now = this.ctx.currentTime;
    for (const layer of this.gainPattern.layers) {
      const param = this.layerGains[layer.key].gain;
      const level = this.layerLevel(layer);
      if (immediate) param.value = level;
      else param.setTargetAtTime(level, now, 0.01);
    }
  }

  // Beim Wechsel auf ein anderes Pattern (Arrangement) gelten dessen Lautstärken ab Taktbeginn.
  scheduleGains(pattern, time) {
    for (const layer of pattern.layers) this.layerGains[layer.key].gain.setValueAtTime(this.layerLevel(layer), time);
  }

  // Einzelnen Schlag direkt anspielen (Feedback beim Setzen einer Note).
  preview(key, level = 1) {
    const ctx = this.ensureContext();
    const layer = this.gainPattern?.layers.find((l) => l.key === key);
    // Vorhören ignoriert Mute/Solo, respektiert aber die Layer-Lautstärke.
    const g = ctx.createGain();
    g.gain.value = (layer ? layer.volume : 1) * level;
    g.connect(this.master);
    VOICES[key](ctx, g, ctx.currentTime + 0.005, this.noiseBuffer);
  }

  start() {
    if (this.playing || !this.hasContent) return;
    const ctx = this.ensureContext();
    this.playing = true;
    this.item = 0;
    this.beat = 0;
    this.bar = 0;
    this.nextBeatTime = ctx.currentTime + 0.08;
    this.timeline = [];
    this.openHats = [];
    this.gainPattern = null;
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
    this.openHats = [];
    this.gainPattern = this.sequence[0] ?? null;
    this.applyGains();
  }

  nextBar() {
    this.beat = 0;
    this.bar += 1;
    this.item = (this.item + 1) % this.sequence.length;
  }

  tick() {
    if (!this.playing || !this.hasContent) return;
    const now = this.ctx.currentTime;
    // Bei stark verzögertem Tick (z. B. Tab im Hintergrund) nicht nachholen, sondern neu ansetzen.
    if (this.nextBeatTime < now - 0.2) this.nextBeatTime = now + 0.05;

    while (this.nextBeatTime < now + SCHEDULE_AHEAD) {
      if (this.item >= this.sequence.length) this.item = 0;
      // Pattern wurde während der Wiedergabe gekürzt → nächster Takt.
      if (this.beat >= this.sequence[this.item].beats) this.nextBar();
      const p = this.sequence[this.item];
      const duration = 60 / p.bpm;
      if (p.id !== this.gainPattern?.id) this.scheduleGains(p, this.nextBeatTime);
      this.gainPattern = p;
      this.scheduleBeat(p, this.beat, this.nextBeatTime, duration);
      this.timeline.push({
        item: this.item,
        bar: this.bar,
        beat: this.beat,
        beats: p.beats,
        time: this.nextBeatTime,
        duration,
      });
      this.nextBeatTime += duration;
      this.beat += 1;
      if (this.beat >= p.beats) this.nextBar();
    }

    this.sources = this.sources.filter((s) => s.end > now);
    while (this.timeline.length > 1 && this.timeline[1].time <= now) this.timeline.shift();
  }

  scheduleBeat(pattern, beat, time, duration) {
    for (const { key, frac, level } of beatEvents(pattern, beat)) {
      const t = time + frac * duration;
      let out = this.layerGains[key];
      if (level !== 1) {
        // Ghost Note: eigene, leisere Verstärkung vor dem Layer-Regler.
        const velocity = this.ctx.createGain();
        velocity.gain.value = level;
        velocity.connect(out);
        out = velocity;
      }
      if (CHOKERS.has(key)) this.chokeOpenHats(pattern, key, t);
      if (key === 'hihat_open') {
        const choke = this.ctx.createGain();
        choke.connect(out);
        out = choke;
        this.openHats.push({ gain: choke.gain, start: t, end: t + OPEN_HAT_RING });
      }
      const nodes = VOICES[key](this.ctx, out, t, this.noiseBuffer);
      for (const node of nodes) this.sources.push({ node, end: t + RELEASE });
    }
  }

  // Die offene Hi-Hat klingt höchstens bis zum nächsten hörbaren Hi-Hat-Schlag.
  chokeOpenHats(pattern, key, t) {
    const layer = pattern.layers.find((l) => l.key === key);
    if (!layer || this.layerLevel(layer) === 0) return;
    for (const hat of this.openHats) {
      if (hat.start < t && hat.end > t) {
        hat.gain.setValueAtTime(1, t);
        hat.gain.linearRampToValueAtTime(0, t + CHOKE_TIME);
        hat.end = t;
      }
    }
    this.openHats = this.openHats.filter((hat) => hat.end > t);
  }

  // Aktuelle Position für die Anzeige: Pattern (Arrangement), Zählzeit + Fortschritt innerhalb der Zählzeit.
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    let current = null;
    for (const entry of this.timeline) {
      if (entry.time <= now) current = entry;
      else break;
    }
    if (!current) return null;
    return {
      item: current.item,
      bar: current.bar,
      beat: current.beat,
      beats: current.beats,
      frac: Math.min(1, (now - current.time) / current.duration),
    };
  }
}
