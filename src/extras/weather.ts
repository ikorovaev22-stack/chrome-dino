/**
 * Weather that changes along the run: rain, snow and sand storms. Purely
 * visual; particles are drawn in the sprite colour so night mode and dark mode
 * invert them along with everything else.
 */

import {getRandomNum} from '../dino_game/utils.js';

type WeatherKind = 'clear'|'rain'|'snow'|'sand';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

/** Distance (in game pixels) the first stretch stays clear. */
const FIRST_CHANGE = 12000;
/** Seconds for weather to fade in or out. */
const FADE_MS = 2500;
const MAX_PARTICLES: Record<WeatherKind, number> = {
  clear: 0,
  rain: 70,
  snow: 55,
  sand: 45,
};

export class Weather {
  private kind: WeatherKind = 'clear';
  private next: WeatherKind = 'clear';
  private intensity: number = 0;
  private untilChange: number = FIRST_CHANGE;
  private particles: Particle[] = [];

  constructor(private width: () => number, private height: number) {}

  reset() {
    this.kind = 'clear';
    this.next = 'clear';
    this.intensity = 0;
    this.untilChange = FIRST_CHANGE;
    this.particles = [];
  }

  /**
   * @param distance Pixels the ground moved this frame.
   */
  update(deltaTime: number, distance: number, speed: number) {
    this.untilChange -= distance;
    if (this.untilChange <= 0) {
      // Alternate between clear skies and a random kind of weather.
      const options: WeatherKind[] = ['rain', 'snow', 'sand'];
      this.next = this.kind === 'clear' ?
          options[getRandomNum(0, options.length - 1)]! :
          'clear';
      this.untilChange = this.next === 'clear' ? getRandomNum(8000, 16000) :
                                                 getRandomNum(10000, 18000);
    }

    // Fade out the current weather before switching to the next one.
    const fade = deltaTime / FADE_MS;
    if (this.next !== this.kind) {
      this.intensity = Math.max(0, this.intensity - fade);
      if (this.intensity === 0) {
        this.kind = this.next;
      }
    } else if (this.kind !== 'clear') {
      this.intensity = Math.min(1, this.intensity + fade);
    }

    const target = Math.round(MAX_PARTICLES[this.kind] * this.intensity);
    while (this.particles.length < target) {
      this.particles.push(this.spawn(true));
    }
    if (this.particles.length > target) {
      this.particles.length = target;
    }

    const frames = deltaTime / (1000 / 60);
    for (const p of this.particles) {
      p.x += (p.vx - speed * this.drift()) * frames;
      p.y += p.vy * frames;
      p.phase += 0.05 * frames;
      if (p.y > this.height || p.x < -20 || p.x > this.width() + 20) {
        Object.assign(p, this.spawn(false));
      }
    }
  }

  /** How strongly particles follow the ground's movement. */
  private drift(): number {
    return this.kind === 'sand' ? 0.6 : this.kind === 'snow' ? 0.25 : 0.15;
  }

  private spawn(anywhere: boolean): Particle {
    const width = this.width();
    const p: Particle = {
      x: Math.random() * (width + 60),
      y: anywhere ? Math.random() * this.height : -10,
      vx: 0,
      vy: 0,
      size: 1,
      phase: Math.random() * Math.PI * 2,
    };
    switch (this.kind) {
      case 'rain':
        p.vx = -1.5;
        p.vy = 6 + Math.random() * 3;
        break;
      case 'snow':
        p.vy = 0.5 + Math.random() * 0.7;
        p.size = Math.random() < 0.4 ? 2 : 1;
        break;
      case 'sand':
        p.x = anywhere ? Math.random() * width : width + Math.random() * 40;
        p.y = Math.random() * this.height;
        p.vx = -4 - Math.random() * 6;
        p.vy = (Math.random() - 0.3) * 0.4;
        p.size = 2 + Math.floor(Math.random() * 8);
        break;
      default:
        break;
    }
    return p;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.particles.length) {
      return;
    }
    ctx.save();
    ctx.fillStyle = '#535353';
    ctx.globalAlpha = this.kind === 'snow' ? 0.55 : 0.35;
    for (const p of this.particles) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      switch (this.kind) {
        case 'rain':
          // Slanted streak.
          ctx.fillRect(x, y, 1, 3);
          ctx.fillRect(x - 1, y + 3, 1, 3);
          break;
        case 'snow':
          ctx.fillRect(
              x + Math.round(Math.sin(p.phase) * 2), y, p.size, p.size);
          break;
        case 'sand':
          ctx.fillRect(x, y, p.size, 1);
          break;
        default:
          break;
      }
    }
    ctx.restore();
  }
}
