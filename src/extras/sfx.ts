/**
 * Short synthesized sound effects for the extended game, in the same 8-bit
 * spirit as the original beeps.
 */

let shared: AudioContext|null = null;
let unavailable = false;

/** One audio context for all the sound effects. */
function audioContext(): AudioContext|null {
  if (!shared && !unavailable) {
    try {
      shared = new AudioContext();
    } catch {
      unavailable = true;
    }
  }
  return shared;
}

/**
 * Safari on iOS only starts audio from a user gesture, and stops it again
 * when the app goes to the background, while sounds mostly play from the
 * game loop. So every tap or key press wakes the context up if needed.
 */
function wakeAudio() {
  const ctx = audioContext();
  if (!ctx || ctx.state === 'running') {
    return;
  }
  ctx.resume().catch(() => {});
  // Older iOS versions also want a sound started inside the gesture.
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  source.connect(ctx.destination);
  source.start();
}

for (const type of ['touchend', 'pointerdown', 'keydown']) {
  window.addEventListener(type, wakeAudio, {capture: true, passive: true});
}

export class Sfx {
  private getContext(): AudioContext|null {
    const ctx = audioContext();
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  private tone(
      frequency: number, start: number, duration: number,
      type: OscillatorType = 'square', volume = 0.04,
      endFrequency?: number) {
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (endFrequency) {
      osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    }
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  private noise(duration: number, volume = 0.08) {
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  /** Higher pitched as the combo multiplier grows. */
  coin(multiplier = 1) {
    const pitch = Math.pow(1.06, multiplier - 1);
    this.tone(988 * pitch, 0, 0.06);
    this.tone(1319 * pitch, 0.06, 0.12);
  }

  hurt() {
    this.noise(0.12, 0.06);
    this.tone(300, 0, 0.18, 'square', 0.05, 110);
  }

  heal() {
    [659, 880, 1175].forEach(
        (f, i) => this.tone(f, i * 0.06, 0.1, 'triangle', 0.07));
  }

  /** Short tick for moving through menus. */
  select() {
    this.tone(660, 0, 0.04, 'square', 0.02);
  }

  confirm() {
    this.tone(784, 0, 0.05, 'square', 0.03);
    this.tone(1175, 0.05, 0.08, 'square', 0.03);
  }

  deny() {
    this.tone(220, 0, 0.12, 'square', 0.03, 180);
  }

  powerUp() {
    [523, 659, 784, 1047].forEach(
        (f, i) => this.tone(f, i * 0.05, 0.08, 'triangle', 0.08));
  }

  powerDown() {
    this.tone(659, 0, 0.08, 'triangle', 0.06);
    this.tone(440, 0.08, 0.14, 'triangle', 0.06);
  }

  doubleJump() {
    this.tone(420, 0, 0.09, 'square', 0.03, 900);
  }

  levelUp() {
    [523, 659, 784, 659, 784, 1047].forEach(
        (f, i) => this.tone(f, i * 0.09, 0.12, 'square', 0.035));
  }

  smash() {
    this.noise(0.18);
    this.tone(160, 0, 0.12, 'square', 0.04, 60);
  }
}
