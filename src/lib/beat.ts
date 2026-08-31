/** A four-on-the-floor loop, synthesised in the browser from oscillators and
 *  filtered noise. Nothing is sampled and nothing is fetched — there is no
 *  audio file in this app. It only ever starts from a click, because that is
 *  both the autoplay rule and good manners. */

const BPM = 102;
const STEP = 60 / BPM / 4; // a sixteenth
const LOOKAHEAD = 0.12;
const TICK = 25;

/** Sixteen steps: kick on every beat, an open-ish hat on the off-eighths,
 *  a two-note bass figure underneath. */
const KICK = [0, 4, 8, 12];
const HAT = [2, 6, 10, 14];
const SNAP = [4, 12];
const BASS: Record<number, number> = { 0: 55, 3: 55, 6: 73.42, 8: 55, 11: 65.41, 14: 49 };

export class Beat {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private noise: AudioBuffer | null = null;

  get playing(): boolean {
    return this.timer !== null;
  }

  /** True when the browser gives us Web Audio at all. */
  static supported(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  async start(volume = 0.22): Promise<void> {
    if (this.timer !== null) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = volume;
      this.out.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx);
    }
    await this.ctx.resume();
    this.step = 0;
    this.next = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), TICK);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    void this.ctx?.suspend();
  }

  setVolume(v: number): void {
    if (this.out) this.out.gain.value = v;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.out = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      const t = this.next;
      const i = this.step % 16;
      if (KICK.includes(i)) this.kick(t);
      if (HAT.includes(i)) this.hat(t, 0.05);
      if (SNAP.includes(i)) this.hat(t, 0.13, 1800);
      if (BASS[i]) this.bass(t, BASS[i]);
      this.next += STEP;
      this.step += 1;
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(128, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private hat(t: number, decay: number, cut = 7200): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(hp).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  private bass(t: number, hz: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(lp).connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.24);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}
