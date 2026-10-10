/**
 * Weather of the current world: rain and falling leaves in the forest, snow
 * and blizzards in the mountains, sand storms, embers near the volcano.
 * Purely visual.
 */

import {getRandomNum} from '../dino_game/utils.js';

import type {Biome, WeatherKind} from './biomes.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  color: string;
}

/** Ground distance (pixels) the first stretch of a world stays clear. */
const FIRST_CHANGE = 6000;
const FADE_MS = 2500;
const MAX_PARTICLES: Record<WeatherKind, number> = {
  clear: 0,
  rain: 80,
  snow: 45,
  blizzard: 110,
  sand: 45,
  leaves: 26,
  embers: 40,
};
/** How strongly particles follow the ground's movement. */
const DRIFT: Record<WeatherKind, number> = {
  clear: 0,
  rain: 0.15,
  snow: 0.25,
  blizzard: 0.5,
  sand: 0.6,
  leaves: 0.3,
  embers: 0.2,
};
const LEAF_COLORS = ['#e5a03a', '#d4622b', '#8bc34a', '#c9a227'];
const EMBER_COLORS = ['#ffb030', '#ff6a1f', '#ffd23f'];

export class Weather {
  private kind: WeatherKind = 'clear';
  private next: WeatherKind = 'clear';
  private options: WeatherKind[] = ['clear'];
  private intensity: number = 0;
  private untilChange: number = FIRST_CHANGE;
  private particles: Particle[] = [];

  constructor(private width: () => number, private height: number) {}

  /** Switches to the weather of another world (fading over). */
  setBiome(biome: Biome) {
    this.options = biome.weather;
    // Worlds without clear skies start with their weather right away.
    this.next = this.options.includes('clear') ? 'clear' : this.options[0]!;
    this.untilChange = FIRST_CHANGE;
  }

  reset(biome: Biome) {
    this.setBiome(biome);
    this.kind = this.next;
    this.intensity = this.kind === 'clear' ? 0 : 1;
    this.particles = [];
  }

  /**
   * @param distance Pixels the ground moved this frame.
   */
  update(deltaTime: number, distance: number, speed: number) {
    this.untilChange -= distance;
    if (this.untilChange <= 0) {
      if (this.kind !== 'clear' && this.options.includes('clear')) {
        // Clear skies in between, when the world has them.
        this.next = 'clear';
      } else {
        const choices = this.options.filter(
            kind => kind !== 'clear' && kind !== this.kind);
        this.next = choices.length ?
            choices[getRandomNum(0, choices.length - 1)]! :
            this.kind;
      }
      this.untilChange = getRandomNum(8000, 16000);
    }

    const fade = deltaTime / FADE_MS;
    if (this.next !== this.kind) {
      this.intensity = Math.max(0, this.intensity - fade);
      if (this.intensity === 0) {
        this.kind = this.next;
        this.particles = [];
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
    const drift = speed * DRIFT[this.kind];
    for (const p of this.particles) {
      p.x += (p.vx - drift) * frames;
      p.y += p.vy * frames;
      p.phase += 0.06 * frames;
      if (p.y > this.height + 4 || p.y < -10 || p.x < -20 ||
          p.x > this.width() + 40) {
        Object.assign(p, this.spawn(false));
      }
    }
  }

  private spawn(anywhere: boolean): Particle {
    const width = this.width();
    const p: Particle = {
      x: Math.random() * (width + 60),
      y: anywhere ? Math.random() * this.height : -6,
      vx: 0,
      vy: 0,
      size: 1,
      phase: Math.random() * Math.PI * 2,
      color: '#ffffff',
    };
    switch (this.kind) {
      case 'rain':
        p.vx = -1.5;
        p.vy = 6 + Math.random() * 3;
        p.color = '#4f7fc4';
        break;
      case 'snow':
      case 'blizzard':
        p.vx = this.kind === 'blizzard' ? -2.5 - Math.random() * 2 : 0;
        p.vy = 0.5 + Math.random() * (this.kind === 'blizzard' ? 1.5 : 0.7);
        p.size = Math.random() < 0.4 ? 2 : 1;
        break;
      case 'sand':
        p.x = anywhere ? Math.random() * width : width + Math.random() * 40;
        p.y = Math.random() * this.height;
        p.vx = -4 - Math.random() * 6;
        p.vy = (Math.random() - 0.3) * 0.4;
        p.size = 2 + Math.floor(Math.random() * 8);
        p.color = '#c99a52';
        break;
      case 'leaves':
        p.vx = -0.6 - Math.random();
        p.vy = 0.5 + Math.random() * 0.6;
        p.size = 2;
        p.color = LEAF_COLORS[getRandomNum(0, LEAF_COLORS.length - 1)]!;
        break;
      case 'embers':
        // Rise from the ground.
        p.y = anywhere ? Math.random() * this.height : this.height + 2;
        p.vx = -0.3 - Math.random() * 0.5;
        p.vy = -0.4 - Math.random() * 0.8;
        p.size = Math.random() < 0.3 ? 2 : 1;
        p.color = EMBER_COLORS[getRandomNum(0, EMBER_COLORS.length - 1)]!;
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
    for (const p of this.particles) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      ctx.fillStyle = p.color;
      switch (this.kind) {
        case 'rain':
          ctx.globalAlpha = 0.5;
          // Slanted streak.
          ctx.fillRect(x, y, 1, 3);
          ctx.fillRect(x - 1, y + 3, 1, 3);
          break;
        case 'snow':
        case 'blizzard': {
          const sx = x + Math.round(Math.sin(p.phase) * 2);
          // A faint shadow keeps flakes visible on the pale sky.
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#7d9cc4';
          ctx.fillRect(sx, y + 1, p.size, p.size);
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, y, p.size, p.size);
          break;
        }
        case 'sand':
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x, y, p.size, 1);
          break;
        case 'leaves': {
          ctx.globalAlpha = 0.9;
          // Tumbling: wide, then tall.
          const wide = Math.sin(p.phase * 2) > 0;
          ctx.fillRect(
              x + Math.round(Math.sin(p.phase) * 3), y, wide ? 3 : 1,
              wide ? 1 : 3);
          break;
        }
        case 'embers':
          ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(p.phase * 3));
          ctx.fillRect(x, y, p.size, p.size);
          break;
        default:
          break;
      }
    }
    ctx.restore();
  }
}
