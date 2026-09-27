/**
 * All sound is synthesised with Web Audio, so there are no files to load and
 * nothing to wait for on a cold start.
 */
export class ScrollAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private humGain!: GainNode;
  private humFilter!: BiquadFilterNode;
  private rustleGain!: GainNode;
  private lastHum = -1;
  private lastCutoff = -1;
  private lastRustle = -1;

  /** Browsers only start audio inside a user gesture: call from the Enter XR click. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Scanner hum: slightly detuned saws through a resonant low-pass.
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 380;
    this.humFilter.Q.value = 5;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    for (const f of [110, 110.6, 220.9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(this.humFilter);
      o.start();
    }
    this.humFilter.connect(this.humGain).connect(this.master);

    // Dry papyrus: sparse crackle in looped noise through a band-pass.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.015 ? 1 : 0.2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2600;
    band.Q.value = 0.7;
    this.rustleGain = ctx.createGain();
    this.rustleGain.gain.value = 0;
    src.connect(band).connect(this.rustleGain).connect(this.master);
    src.start();
    void ctx.resume();
  }

  /** `level` 0..1 is how strongly a palm is scanning; `revealing` is new ink this frame. */
  scan(level: number, revealing: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const hum = Math.round(level * 20) / 20;
    if (hum !== this.lastHum) {
      this.lastHum = hum;
      this.humGain.gain.setTargetAtTime(hum * 0.1, t, 0.08);
    }
    const cutoff = revealing ? 1500 : 380 + hum * 250;
    if (cutoff !== this.lastCutoff) {
      this.lastCutoff = cutoff;
      this.humFilter.frequency.setTargetAtTime(cutoff, t, revealing ? 0.03 : 0.25);
    }
  }

  /** `speed` is how fast the roll is being pulled open, in m/s. */
  unroll(speed: number): void {
    if (!this.ctx) return;
    const level = Math.round(Math.min(1, speed * 3) * 20) / 20;
    if (level === this.lastRustle) return;
    this.lastRustle = level;
    this.rustleGain.gain.setTargetAtTime(level * 0.6, this.ctx.currentTime, 0.04);
  }

  /** A rising chord for the moment the word is found. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      const at = t0 + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.16, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 2.5);
    });
  }
}

export const scrollAudio = new ScrollAudio();
