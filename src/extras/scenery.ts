/**
 * Background of the coloured game: sky, sun, two parallax layers and the
 * ground, drawn before the original horizon, clouds and obstacles. Handles
 * the fade between worlds, night time, and background life (birds, smoke).
 */

import type {Biome, Layer} from './biomes.js';

/** Where the original horizon line sits on the canvas. */
export const HORIZON_Y = 133;
const CANVAS_HEIGHT = 150;
/** Width of the pre-rendered, seamlessly repeating layer strips. */
const STRIP = 1200;
const WORLD_FADE_MS = 2500;
const NIGHT_FADE_MS = 1500;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(
      ((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** Horizontal distance on the repeating strip. */
function wrapDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % STRIP;
  return Math.min(d, STRIP - d);
}

interface LayerArt {
  canvas: HTMLCanvasElement;
  // The same layer in moonlight.
  night: HTMLCanvasElement;
  // Craters of volcanoes, for the smoke.
  vents: Array<{x: number, y: number}>;
}

/**
 * Heights of a layer along the strip, plus the pixels to highlight.
 */
function shapeLayer(layer: Layer, seed: string) {
  const random = mulberry32(hashString(seed));
  const heights = new Float32Array(STRIP);
  const accents: boolean[][] = Array.from({length: STRIP}, () => []);
  const vents: Array<{x: number, y: number}> = [];
  const H = layer.height;
  const phase = () => random() * Math.PI * 2;
  const wave = (frequency: number, amplitude: number) => {
    const p = phase();
    return (x: number) =>
        Math.sin(x / STRIP * Math.PI * 2 * frequency + p) * amplitude;
  };

  switch (layer.shape) {
    case 'dunes':
    case 'hills': {
      const hills = layer.shape === 'hills';
      const w1 = wave(hills ? 5 : 3, 0.25);
      const w2 = wave(hills ? 11 : 7, hills ? 0.18 : 0.12);
      const w3 = wave(hills ? 17 : 13, 0.05);
      for (let x = 0; x < STRIP; x++) {
        heights[x] = H * (0.55 + w1(x) + w2(x) + w3(x));
      }
      break;
    }
    case 'mesas': {
      // Flat-topped plateaus with steep sides.
      const targets = new Float32Array(STRIP);
      let x = 0;
      while (x < STRIP) {
        const width = 50 + Math.floor(random() * 130);
        const level = [0.35, 0.6, 0.85, 1][Math.floor(random() * 4)]!;
        for (let i = 0; i < width && x + i < STRIP; i++) {
          targets[x + i] = H * level;
        }
        x += width;
      }
      // Limit the slope, going round the strip twice so it wraps cleanly.
      let h = targets[0]!;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < STRIP; i++) {
          const target = targets[i]!;
          h += Math.max(-2.5, Math.min(2.5, target - h));
          heights[i] = h;
        }
      }
      break;
    }
    case 'forest': {
      const base = wave(4, 0.12);
      for (let x = 0; x < STRIP; x++) {
        heights[x] = H * (0.25 + base(x));
      }
      for (let xc = 0; xc < STRIP; xc += 9 + Math.floor(random() * 12)) {
        const half = 5 + Math.floor(random() * 5);
        const tall = H * (0.55 + random() * 0.45);
        const lit = random() < 0.5;
        for (let dx = -half; dx <= half; dx++) {
          const x = (xc + dx + STRIP) % STRIP;
          // Stepped sides, like a pixel-art fir.
          const step = Math.floor(Math.abs(dx) / 2) * 2;
          const h = tall * (1 - step / (half + 1));
          if (h > heights[x]!) {
            heights[x] = h;
            accents[x] = lit ? [true] : [];
          }
        }
      }
      break;
    }
    case 'peaks':
    case 'volcanoes': {
      const volcano = layer.shape === 'volcanoes';
      const count = volcano ? 3 : 7;
      const peaks = Array.from({length: count}, (_, i) => ({
        x: (i + random() * 0.6) * STRIP / count,
        h: H * (0.55 + random() * 0.45),
        half: volcano ? 120 + random() * 60 : 50 + random() * 50,
      }));
      for (let x = 0; x < STRIP; x++) {
        let h = 0;
        for (const peak of peaks) {
          let ph = peak.h * (1 - wrapDistance(x, peak.x) / peak.half);
          if (volcano) {
            // Cut the top off for the crater.
            ph = Math.min(ph, peak.h * 0.92);
          }
          h = Math.max(h, ph);
        }
        heights[x] = h + (volcano ? 0 : (random() - 0.5) * 1.5);
      }
      for (const peak of peaks) {
        if (volcano) {
          vents.push({
            x: Math.round(peak.x),
            y: HORIZON_Y - Math.round(peak.h * 0.92),
          });
        }
      }
      break;
    }
  }
  return {heights, accents, vents, random};
}

function renderLayer(layer: Layer, seed: string): LayerArt {
  const {heights, accents, vents, random} = shapeLayer(layer, seed);
  const canvas = document.createElement('canvas');
  canvas.width = STRIP;
  canvas.height = HORIZON_Y;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = layer.color;
  for (let x = 0; x < STRIP; x++) {
    const h = Math.max(0, Math.round(heights[x]!));
    ctx.fillRect(x, HORIZON_Y - h, 1, h);
  }

  if (layer.accent) {
    ctx.fillStyle = layer.accent;
    for (let x = 0; x < STRIP; x++) {
      const h = Math.round(heights[x]!);
      const top = HORIZON_Y - h;
      if (layer.shape === 'peaks' && h > layer.height * 0.6) {
        // Snow caps with a ragged lower edge.
        const depth = Math.round((h - layer.height * 0.6) * 0.8 +
                                 (random() < 0.5 ? 1 : 0));
        ctx.fillRect(x, top, 1, depth);
      } else if (layer.shape === 'forest' && accents[x]!.length) {
        ctx.fillRect(x, top, 1, Math.min(h, 3));
      }
    }
    if (layer.shape === 'volcanoes') {
      // Lava running down from each crater.
      for (const vent of vents) {
        for (let i = -6; i <= 6; i += 3) {
          let x = vent.x + i;
          for (let y = vent.y; y < HORIZON_Y - 6; y += 1) {
            if (random() < 0.3) {
              x += random() < 0.5 ? -1 : 1;
            }
            const wx = (x + STRIP) % STRIP;
            if (HORIZON_Y - heights[wx]! <= y) {
              ctx.fillRect(wx, y, 1, 1);
            }
            if (random() < 0.04) {
              break;
            }
          }
        }
        ctx.fillRect(vent.x - 7, vent.y, 15, 2);
      }
    }
  }

  const night = document.createElement('canvas');
  night.width = STRIP;
  night.height = HORIZON_Y;
  const nightCtx = night.getContext('2d')!;
  nightCtx.drawImage(canvas, 0, 0);
  nightCtx.globalCompositeOperation = 'source-atop';
  nightCtx.fillStyle = 'rgba(10, 14, 40, 0.55)';
  nightCtx.fillRect(0, 0, STRIP, HORIZON_Y);
  return {canvas, night, vents};
}

interface Bird {
  x: number;
  y: number;
  phase: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  color: string;
}

export class Scenery {
  private biome: Biome;
  private previous: Biome|null = null;
  private fade: number = 1;
  private night: number = 0;
  private time: number = 0;
  // Ground distance travelled, in pixels; drives the parallax.
  private travelled: number = 0;
  private layers = new Map<string, LayerArt>();
  private birds: Bird[] = [];
  private untilBirds: number = 3000;
  private puffs: Puff[] = [];
  private untilPuff: number = 0;

  constructor(private width: () => number, biome: Biome) {
    this.biome = biome;
  }

  setBiome(biome: Biome, instant = false) {
    if (biome.id === this.biome.id) {
      return;
    }
    this.previous = instant ? null : this.biome;
    this.biome = biome;
    this.fade = instant ? 1 : 0;
    this.birds = [];
    this.puffs = [];
  }

  reset(biome: Biome) {
    this.setBiome(biome, true);
    this.travelled = 0;
    this.night = 0;
  }

  private layer(biome: Biome, which: 'far'|'near'): LayerArt {
    const key = biome.id + which;
    let art = this.layers.get(key);
    if (!art) {
      art = renderLayer(biome[which], key);
      this.layers.set(key, art);
    }
    return art;
  }

  /**
   * @param groundMove Pixels the ground moved this frame.
   */
  draw(
      ctx: CanvasRenderingContext2D, deltaTime: number, groundMove: number,
      isNight: boolean) {
    this.time += deltaTime;
    this.travelled += groundMove;
    this.fade = Math.min(1, this.fade + deltaTime / WORLD_FADE_MS);
    const nightStep = deltaTime / NIGHT_FADE_MS;
    this.night = isNight ? Math.min(1, this.night + nightStep) :
                           Math.max(0, this.night - nightStep);

    if (this.previous && this.fade >= 1) {
      this.previous = null;
    }
    const previous = this.previous;
    const width = this.width();
    if (previous) {
      this.drawSky(ctx, previous, 1, width);
    }
    this.drawSky(ctx, this.biome, previous ? this.fade : 1, width);
    this.drawSun(ctx, width);
    if (previous) {
      this.drawLand(ctx, previous, 1, width);
    }
    this.drawLand(ctx, this.biome, previous ? this.fade : 1, width);
    this.updateLife(deltaTime, groundMove);
    this.drawLife(ctx);
  }

  private drawSky(
      ctx: CanvasRenderingContext2D, biome: Biome, alpha: number,
      width: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, mix(biome.sky[0], biome.nightSky[0], this.night));
    sky.addColorStop(1, mix(biome.sky[1], biome.nightSky[1], this.night));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, HORIZON_Y);
    ctx.restore();
  }

  private drawLand(
      ctx: CanvasRenderingContext2D, biome: Biome, alpha: number,
      width: number) {
    ctx.save();
    for (const which of ['far', 'near'] as const) {
      const layer = biome[which];
      const art = this.layer(biome, which);
      const offset = Math.floor(this.travelled * layer.speed) % STRIP;
      for (let x = -offset; x < width; x += STRIP) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(art.canvas, x, 0);
        if (this.night > 0) {
          ctx.globalAlpha = alpha * this.night;
          ctx.drawImage(art.night, x, 0);
        }
      }
    }

    ctx.globalAlpha = alpha;
    const nightGround = '#1a2040';
    ctx.fillStyle = mix(biome.ground, nightGround, this.night * 0.5);
    ctx.fillRect(0, HORIZON_Y, width, CANVAS_HEIGHT - HORIZON_Y);
    ctx.fillStyle = mix(biome.groundDark, nightGround, this.night * 0.5);
    ctx.fillRect(0, CANVAS_HEIGHT - 5, width, 5);
    ctx.restore();
  }

  /**
   * One sun, moving between worlds: it slides to the new world's height and
   * colour while the background fades over.
   */
  private drawSun(ctx: CanvasRenderingContext2D, width: number) {
    const from = this.previous?.sun ?? null;
    const to = this.biome.sun;
    const t = this.previous ? this.fade : 1;
    let sun = to;
    let alpha = 1;
    if (from && to) {
      sun = {
        y: from.y + (to.y - from.y) * t,
        color: mix(from.color, to.color, t),
        glow: t < 0.5 ? from.glow : to.glow,
      };
    } else if (from || to) {
      // Setting into, or rising from, a world without a sun.
      sun = from ?? to;
      alpha = from ? 1 - t : t;
    }
    if (!sun || this.night >= 1) {
      return;
    }
    const cx = Math.round(width * 0.72);
    const cy = Math.round(sun.y);
    const radius = Math.round(9 + Math.max(0, sun.y - 30) * 0.16);
    ctx.save();
    ctx.globalAlpha = alpha * (1 - this.night);
    const glow = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius * 3);
    glow.addColorStop(0, sun.glow);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius * 3, cy - radius * 3, radius * 6, radius * 6);
    // Pixel disc.
    ctx.fillStyle = sun.color;
    for (let dy = -radius; dy <= radius; dy++) {
      const half = Math.round(Math.sqrt(radius * radius - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2, 1);
    }
    ctx.restore();
  }

  private updateLife(deltaTime: number, groundMove: number) {
    const frames = deltaTime / (1000 / 60);
    const width = this.width();

    if (this.biome.ambient === 'birds') {
      this.untilBirds -= deltaTime;
      if (this.untilBirds <= 0 && !this.birds.length) {
        const y = 18 + Math.random() * 40;
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          this.birds.push({
            x: width + 10 + i * 9,
            y: y + (i % 2) * 5 + i * 1.5,
            phase: Math.random() * 6,
          });
        }
        this.untilBirds = 7000 + Math.random() * 7000;
      }
      for (const bird of this.birds) {
        // Their own flight plus a little parallax.
        bird.x -= 0.5 * frames + groundMove * 0.12;
        bird.phase += 0.25 * frames;
      }
      this.birds = this.birds.filter(bird => bird.x > -10);
    }

    if (this.biome.ambient === 'smoke') {
      const far = this.biome.far;
      const art = this.layer(this.biome, 'far');
      this.untilPuff -= deltaTime;
      if (this.untilPuff <= 0) {
        const offset = Math.floor(this.travelled * far.speed) % STRIP;
        for (const vent of art.vents) {
          const x = vent.x - offset;
          for (const sx of [x, x + STRIP]) {
            if (sx > -20 && sx < width + 20) {
              this.puffs.push({
                x: sx,
                y: vent.y - 2,
                r: 2,
                age: 0,
                life: 3500,
                vx: -0.15,
                vy: -0.25,
                color: '#5b4352',
              });
              // Now and then a burst of lava sparks.
              if (Math.random() < 0.25) {
                for (let i = 0; i < 5; i++) {
                  this.puffs.push({
                    x: sx,
                    y: vent.y,
                    r: 1,
                    age: 0,
                    life: 900,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: -1.2 - Math.random(),
                    color: '#ffb03a',
                  });
                }
              }
            }
          }
        }
        this.untilPuff = 450;
      }
      const drift = far.speed * groundMove;
      for (const puff of this.puffs) {
        puff.age += deltaTime;
        puff.x += puff.vx * frames - drift;
        puff.y += puff.vy * frames;
        if (puff.r === 1) {
          puff.vy += 0.06 * frames;
        } else {
          puff.r += 0.03 * frames;
        }
      }
      this.puffs = this.puffs.filter(puff => puff.age < puff.life);
    }
  }

  private drawLife(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.night > 0.5 ? '#c9c3e0' : '#3b2b3b';
    ctx.globalAlpha = 0.75;
    for (const bird of this.birds) {
      const x = Math.round(bird.x);
      const y = Math.round(bird.y);
      const up = Math.sin(bird.phase) > 0;
      // A tiny "v" flapping its wings.
      ctx.fillRect(x, y + (up ? 0 : 1), 2, 1);
      ctx.fillRect(x + 2, y + 1, 1, 1);
      ctx.fillRect(x + 3, y + (up ? 0 : 1), 2, 1);
    }
    for (const puff of this.puffs) {
      ctx.globalAlpha = (1 - puff.age / puff.life) * (puff.r === 1 ? 1 : 0.5);
      ctx.fillStyle = puff.color;
      const r = Math.round(puff.r);
      ctx.fillRect(Math.round(puff.x - r), Math.round(puff.y - r), r * 2, r * 2);
    }
    ctx.restore();
  }
}
