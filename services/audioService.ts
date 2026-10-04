/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type Wave = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private isMuted = false;
  private volume = 0.8;
  private ambient: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  /** Whether a round wants the drone, independent of mute, so unmuting
   *  mid-round brings it back. */
  private wantAmbient = false;
  private hidden = false;
  private unavailable = false;

  private init() {
    if (this.unavailable) return;
    if (!this.ctx) {
      try {
        const Ctor =
          typeof window === "undefined"
            ? undefined
            : window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.unavailable = true;
          return;
        }
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.isMuted ? 0 : this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        // Some embedded browsers refuse to construct an AudioContext at all.
        this.unavailable = true;
        this.ctx = null;
        this.master = null;
        return;
      }
    }
    if (this.ctx.state === "suspended" && !this.hidden) {
      this.ctx.resume().catch(() => undefined);
    }
  }

  /**
   * Browsers only let audio start from a real user gesture. Hand-gesture
   * "clicks" don't count, so the first genuine pointer or key press anywhere
   * unlocks the context for the rest of the session.
   */
  unlock() {
    this.init();
  }

  /** Silences everything while the tab is in the background. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend().catch(() => undefined);
    else this.ctx.resume().catch(() => undefined);
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.isMuted ? 0 : this.volume,
      this.ctx.currentTime,
      0.02
    );
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    this.applyGain();
    if (!muted && this.wantAmbient) this.startAmbient();
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyGain();
  }

  /** One-shot voice with an exponential decay envelope. */
  private tone(opts: {
    type?: Wave;
    from: number;
    to?: number;
    duration: number;
    gain?: number;
    delay?: number;
  }) {
    if (this.isMuted || this.hidden) return;
    this.init();
    if (!this.ctx || !this.master || this.ctx.state !== "running") return;

    const ctx = this.ctx;
    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.from, start);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.to),
        start + opts.duration
      );
    }

    const peak = Math.max(0.0001, opts.gain ?? 0.2);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + opts.duration + 0.02);
  }

  playShoot() {
    this.tone({ type: "triangle", from: 440, to: 110, duration: 0.2, gain: 0.24 });
    this.tone({ type: "sine", from: 900, to: 300, duration: 0.12, gain: 0.08 });
  }

  /** Pitch climbs with the combo so a chain audibly escalates. */
  playPop(multiplier = 1) {
    const base = 300 + multiplier * 42;
    this.tone({ type: "sine", from: base, to: base * 1.6, duration: 0.12, gain: 0.2 });
    this.tone({
      type: "triangle",
      from: base * 2,
      to: base * 2.6,
      duration: 0.08,
      gain: 0.06,
      delay: 0.02,
    });
  }

  playClick() {
    this.tone({ type: "sine", from: 880, duration: 0.05, gain: 0.09 });
  }

  playHover() {
    this.tone({ type: "sine", from: 1250, duration: 0.04, gain: 0.04 });
  }

  /** Rising tick used for the gesture dwell ring. */
  playDwellTick(progress: number) {
    this.tone({
      type: "sine",
      from: 620 + progress * 520,
      duration: 0.035,
      gain: 0.035,
    });
  }

  playWall() {
    this.tone({ type: "triangle", from: 220, to: 160, duration: 0.06, gain: 0.07 });
  }

  playVictory() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ type: "sine", from: f, duration: 0.5, gain: 0.14, delay: i * 0.11 })
    );
  }

  playDefeat() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ type: "triangle", from: f, duration: 0.55, gain: 0.13, delay: i * 0.14 })
    );
  }

  /** Low underwater drone that sits beneath everything else. */
  startAmbient() {
    this.wantAmbient = true;
    if (this.isMuted || this.ambient) return;
    this.init();
    if (!this.ctx || !this.master) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 58;
    gain.gain.value = 0.05;

    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();

    this.ambient = { osc, lfo, gain };
  }

  stopAmbient() {
    this.wantAmbient = false;
    if (!this.ambient || !this.ctx) return;
    const { osc, lfo, gain } = this.ambient;
    const end = this.ctx.currentTime + 0.6;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    osc.stop(end);
    lfo.stop(end);
    this.ambient = null;
  }
}

export const audioManager = new SoundEngine();
