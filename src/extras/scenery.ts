/**
 * The world behind the game, drawn on its own canvas: sky with sun, moon and
 * stars, drifting clouds, parallax hills, and the ground with layers of soil
 * underneath. Handles the fade between worlds, night time, and background
 * life (birds, smoke, fireflies, light shafts).
 */

import type {Biome, Layer} from './biomes.js';

/** Size of the scene; the game's 600x150 strip sits inside it. */
export const SCENE_HEIGHT = 240;
/** Where the game strip starts. */
export const STRIP_TOP = 60;
/** The ground surface (the original horizon line). */
export const GROUND_Y = STRIP_TOP + 133;

/** Width of the pre-rendered, seamlessly repeating strips. */
const STRIP = 1200;
const GROUND_STRIP = 480;
/** Rows above the ground line used by grass and snow tufts. */
const TUFTS = 4;
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

function rgb(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const pa = rgb(a);
  const pb = rgb(b);
  const c = (i: number) => Math.round(pa[i]! * (1 - t) + pb[i]! * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** Horizontal distance on the repeating strip. */
function wrapDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % STRIP;
  return Math.min(d, STRIP - d);
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return {canvas, ctx: canvas.getContext('2d')!};
}

interface LayerArt {
  day: HTMLCanvasElement;
  // The same layer in moonlight.
  night: HTMLCanvasElement;
  // Craters of volcanoes, for the smoke.
  vents: Array<{x: number, y: number}>;
}

/** Heights of a layer along the strip, plus the columns to highlight. */
function shapeLayer(layer: Layer, H: number, seed: string) {
  const random = mulberry32(hashString(seed));
  const heights = new Float32Array(STRIP);
  const lit = new Uint8Array(STRIP);
  const vents: Array<{x: number, y: number}> = [];
  const wave = (frequency: number, amplitude: number) => {
    const p = random() * Math.PI * 2;
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
          h += Math.max(-2.5, Math.min(2.5, targets[i]! - h));
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
        const light = random() < 0.5;
        for (let dx = -half; dx <= half; dx++) {
          const x = (xc + dx + STRIP) % STRIP;
          // Stepped sides, like a pixel-art fir.
          const step = Math.floor(Math.abs(dx) / 2) * 2;
          const h = tall * (1 - step / (half + 1));
          if (h > heights[x]!) {
            heights[x] = h;
            lit[x] = light ? 1 : 0;
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
        half: volcano ? 130 + random() * 60 : 55 + random() * 50,
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
      if (volcano) {
        for (const peak of peaks) {
          vents.push({
            x: Math.round(peak.x),
            y: GROUND_Y - Math.round(peak.h * 0.92),
          });
        }
      }
      break;
    }
  }
  return {heights, lit, vents, random};
}

function renderLayer(layer: Layer, H: number, seed: string): LayerArt {
  const {heights, lit, vents, random} = shapeLayer(layer, H, seed);
  const {canvas, ctx} = newCanvas(STRIP, GROUND_Y);
  ctx.fillStyle = layer.color;
  for (let x = 0; x < STRIP; x++) {
    const h = Math.max(0, Math.round(heights[x]!));
    ctx.fillRect(x, GROUND_Y - h, 1, h);
  }
  // Soft shading towards the bottom gives the layer some depth.
  const shade = ctx.createLinearGradient(0, GROUND_Y - H, 0, GROUND_Y);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, STRIP, GROUND_Y);
  ctx.globalCompositeOperation = 'source-over';

  if (layer.accent) {
    ctx.fillStyle = layer.accent;
    for (let x = 0; x < STRIP; x++) {
      const h = Math.round(heights[x]!);
      const top = GROUND_Y - h;
      if (layer.shape === 'peaks' && h > H * 0.6) {
        // Snow caps with a ragged lower edge.
        const depth =
            Math.round((h - H * 0.6) * 0.8 + (random() < 0.5 ? 1 : 0));
        ctx.fillRect(x, top, 1, depth);
      } else if (layer.shape === 'forest' && lit[x]) {
        ctx.fillRect(x, top, 1, Math.min(h, 3));
      }
    }
    if (layer.shape === 'volcanoes') {
      // Lava running down from each crater.
      for (const vent of vents) {
        for (let i = -6; i <= 6; i += 3) {
          let x = vent.x + i;
          for (let y = vent.y; y < GROUND_Y - 8; y++) {
            if (random() < 0.3) {
              x += random() < 0.5 ? -1 : 1;
            }
            const wx = (x + STRIP) % STRIP;
            if (GROUND_Y - heights[wx]! <= y) {
              ctx.fillRect(wx, y, 1, 1);
            }
            if (random() < 0.035) {
              break;
            }
          }
        }
        ctx.fillRect(vent.x - 7, vent.y, 15, 2);
      }
    }
  }

  const {canvas: night, ctx: nightCtx} = newCanvas(STRIP, GROUND_Y);
  nightCtx.drawImage(canvas, 0, 0);
  nightCtx.globalCompositeOperation = 'source-atop';
  nightCtx.fillStyle = 'rgba(10, 14, 40, 0.6)';
  nightCtx.fillRect(0, 0, STRIP, GROUND_Y);
  return {day: canvas, night, vents};
}

/** Puffy pixel clouds, pre-rendered on a repeating strip. */
function renderClouds(biome: Biome, seed: string, big: boolean) {
  const random = mulberry32(hashString(seed));
  const height = 110;
  const {canvas, ctx} = newCanvas(STRIP, height);
  const fill = biome.clouds?.fill ?? '#ffffff';
  const line = biome.clouds?.line ?? '#c5d6ee';
  const shadow = mix(fill, line, 0.55);
  const count = big ? 6 : 8;
  for (let i = 0; i < count; i++) {
    const cx = (i + random() * 0.7) * STRIP / count;
    const cy = big ? 30 + random() * 50 : 12 + random() * 40;
    const puffs = Array.from({length: 4 + Math.floor(random() * 3)}, () => ({
      x: cx + (random() - 0.5) * (big ? 46 : 30),
      y: cy + (random() - 0.5) * 8,
      r: (big ? 8 : 5) + random() * (big ? 9 : 6),
    }));
    const inside = (x: number, y: number) => puffs.some(
        p => (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r * p.r);
    const flatBottom = cy + (big ? 6 : 4);
    for (let x = Math.floor(cx - 70); x < cx + 70; x++) {
      for (let y = 0; y < height; y++) {
        if (y > flatBottom || !inside(x, y)) {
          continue;
        }
        const wx = (x + STRIP) % STRIP;
        const edge = !inside(x, y - 1) || !inside(x - 1, y) ||
            !inside(x + 1, y) || y + 1 > flatBottom;
        ctx.fillStyle = edge ? line : y > flatBottom - 4 ? shadow : fill;
        ctx.fillRect(wx, y, 1, 1);
      }
    }
  }
  return canvas;
}

/**
 * Ground surface and the soil underneath, Terraria style: blocks with a bit
 * of texture, stones, and roots, gems or lava veins.
 */
function renderGround(biome: Biome): HTMLCanvasElement {
  const random = mulberry32(hashString(biome.id + 'ground'));
  const height = SCENE_HEIGHT - GROUND_Y + TUFTS;
  const {canvas, ctx} = newCanvas(GROUND_STRIP, height);
  const soil = biome.soil;
  const top = TUFTS;

  // Soil blocks.
  for (let by = top + 5; by < height; by += 8) {
    for (let bx = 0; bx < GROUND_STRIP; bx += 8) {
      const roll = random();
      ctx.fillStyle = roll < 0.2 ? soil.dark : roll > 0.85 ? soil.light :
                                                             soil.base;
      ctx.fillRect(bx, by, 8, 8);
      // A few darker pixels for texture.
      ctx.fillStyle = soil.dark;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(
            bx + Math.floor(random() * 7), by + Math.floor(random() * 7), 1, 1);
      }
    }
  }
  // Stones.
  for (let i = 0; i < GROUND_STRIP / 22; i++) {
    const x = Math.floor(random() * GROUND_STRIP);
    const y = top + 9 + Math.floor(random() * (height - top - 12));
    ctx.fillStyle = soil.stone;
    ctx.fillRect(x, y, 3 + Math.floor(random() * 3), 2);
    ctx.fillRect(x + 1, y - 1, 2, 1);
  }
  // Details: roots or lava veins, or small gems.
  ctx.fillStyle = soil.detail;
  for (let i = 0; i < GROUND_STRIP / 40; i++) {
    let x = Math.floor(random() * GROUND_STRIP);
    let y = top + 6 + Math.floor(random() * 12);
    const length = 6 + Math.floor(random() * 14);
    if (biome.id === 'forest' || biome.id === 'volcano') {
      for (let j = 0; j < length; j++) {
        ctx.fillRect((x + GROUND_STRIP) % GROUND_STRIP, y, 1, 1);
        y++;
        if (random() < 0.4) {
          x += random() < 0.5 ? -1 : 1;
        }
      }
    } else {
      ctx.fillRect(x, y + 10, 2, 2);
    }
  }
  // Darker deeper down.
  const depth = ctx.createLinearGradient(0, top, 0, height);
  depth.addColorStop(0, 'rgba(0, 0, 0, 0)');
  depth.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = depth;
  ctx.fillRect(0, top + 5, GROUND_STRIP, height);

  // Surface band with a light top edge.
  ctx.fillStyle = biome.ground;
  ctx.fillRect(0, top, GROUND_STRIP, 5);
  ctx.fillStyle = soil.surface;
  ctx.fillRect(0, top, GROUND_STRIP, 1);
  ctx.fillStyle = biome.groundDark;
  for (let x = 0; x < GROUND_STRIP; x++) {
    // Uneven lower edge of the surface band.
    ctx.fillRect(x, top + 5, 1, random() < 0.4 ? 2 : 1);
  }

  // Tufts above the line: grass, snow, pebbles.
  for (let x = 0; x < GROUND_STRIP; x++) {
    const roll = random();
    if (biome.id === 'forest' && roll < 0.35) {
      ctx.fillStyle = roll < 0.12 ? soil.surface : biome.ground;
      ctx.fillRect(x, top - 1 - Math.floor(random() * 3), 1, 3);
    } else if (biome.id === 'snow' && roll < 0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, top - 1, 2, 1);
    } else if (roll < 0.04) {
      ctx.fillStyle = soil.stone;
      ctx.fillRect(x, top - 1, 2, 1);
    }
  }
  return canvas;
}

interface Bird {
  x: number;
  y: number;
  phase: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  color: string;
  gravity: number;
}

interface Firefly {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  phase: number;
  bright: boolean;
}

export interface Light {
  x: number;
  y: number;
  radius: number;
  color?: string;
}

interface WorldArt {
  far: LayerArt;
  near: LayerArt;
  cloudsFar: HTMLCanvasElement;
  cloudsNear: HTMLCanvasElement;
  ground: HTMLCanvasElement;
}

export class Scenery {
  private biome: Biome;
  private previous: Biome|null = null;
  private fade: number = 1;
  private night: number = 0;
  private time: number = 0;
  private art = new Map<string, WorldArt>();
  private birds: Bird[] = [];
  private untilBirds: number = 3000;
  private motes: Mote[] = [];
  private untilPuff: number = 0;
  private fireflies: Firefly[] = [];
  private stars: Star[] = [];
  private travel: number = 0;

  constructor(biome: Biome) {
    this.biome = biome;
    const random = mulberry32(7);
    this.stars = Array.from({length: 80}, () => ({
      x: random(),
      y: random() * (GROUND_Y - 70),
      phase: random() * Math.PI * 2,
      bright: random() < 0.15,
    }));
    this.fireflies = Array.from({length: 14}, () => ({
      x: random() * 600,
      y: GROUND_Y - 10 - random() * 60,
      phase: random() * Math.PI * 2,
      speed: 0.4 + random() * 0.6,
    }));
  }

  /** How dark it is: 0 by day, 1 at night. */
  get nightLevel(): number {
    return this.night;
  }

  get currentBiome(): Biome {
    return this.biome;
  }

  setBiome(biome: Biome, instant = false) {
    if (biome.id === this.biome.id) {
      return;
    }
    this.previous = instant ? null : this.biome;
    this.biome = biome;
    this.fade = instant ? 1 : 0;
    this.birds = [];
    this.motes = [];
  }

  private world(biome: Biome): WorldArt {
    let art = this.art.get(biome.id);
    if (!art) {
      art = {
        far: renderLayer(biome.far, biome.far.height * 1.7, biome.id + 'far'),
        near: renderLayer(
            biome.near, biome.near.height * 1.5, biome.id + 'near'),
        cloudsFar: renderClouds(biome, biome.id + 'cf', false),
        cloudsNear: renderClouds(biome, biome.id + 'cn', true),
        ground: renderGround(biome),
      };
      this.art.set(biome.id, art);
    }
    return art;
  }

  /** Builds a world's art ahead of time, so switching doesn't stutter. */
  prepare(biome: Biome) {
    this.world(biome);
  }

  /**
   * @param travel Pixels the ground has moved this run (as the obstacles).
   */
  draw(
      ctx: CanvasRenderingContext2D, width: number, deltaTime: number,
      travel: number, isNight: boolean) {
    this.time += deltaTime;
    const groundMove = Math.max(0, travel - this.travel);
    this.travel = travel;
    this.fade = Math.min(1, this.fade + deltaTime / WORLD_FADE_MS);
    const nightStep = deltaTime / NIGHT_FADE_MS;
    this.night = isNight ? Math.min(1, this.night + nightStep) :
                           Math.max(0, this.night - nightStep);
    if (this.previous && this.fade >= 1) {
      this.previous = null;
    }

    const previous = this.previous;
    const alpha = previous ? this.fade : 1;
    if (previous) {
      this.drawSky(ctx, previous, 1, width);
    }
    this.drawSky(ctx, this.biome, alpha, width);
    this.drawStars(ctx, width);
    this.drawSun(ctx, width);
    this.drawMoon(ctx, width);
    if (previous) {
      this.drawLand(ctx, previous, 1, width, travel);
    }
    this.drawLand(ctx, this.biome, alpha, width, travel);
    this.updateLife(deltaTime, groundMove, width);
    this.drawLife(ctx);
    if (previous) {
      this.drawGround(ctx, previous, 1, width, travel);
    }
    this.drawGround(ctx, this.biome, alpha, width, travel);
  }

  /** Light sources in the scene, for the night lighting. */
  lights(): Light[] {
    const lights: Light[] = [];
    if (this.biome.id === 'forest') {
      for (const f of this.fireflies) {
        lights.push({x: f.x, y: f.y, radius: 10, color: '#d8ff7a'});
      }
    }
    for (const mote of this.motes) {
      if (mote.r === 1) {
        lights.push({x: mote.x, y: mote.y, radius: 6, color: '#ffb03a'});
      }
    }
    return lights;
  }

  private drawSky(
      ctx: CanvasRenderingContext2D, biome: Biome, alpha: number,
      width: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, mix(biome.sky[0], biome.nightSky[0], this.night));
    sky.addColorStop(1, mix(biome.sky[1], biome.nightSky[1], this.night));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, GROUND_Y);
    ctx.restore();
  }

  private drawStars(ctx: CanvasRenderingContext2D, width: number) {
    if (this.night <= 0) {
      return;
    }
    ctx.save();
    ctx.fillStyle = '#fff6d8';
    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(this.time / 700 + star.phase);
      ctx.globalAlpha = this.night * twinkle;
      const x = Math.round(star.x * width);
      const y = Math.round(star.y);
      ctx.fillRect(x, y, 1, 1);
      if (star.bright) {
        ctx.globalAlpha = this.night * twinkle * 0.5;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
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
    const cx = Math.round(width * 0.78);
    const cy = Math.round(sun.y * 1.35);
    const radius = Math.round(10 + Math.max(0, sun.y - 30) * 0.18);
    ctx.save();
    ctx.globalAlpha = alpha * (1 - this.night);
    // Slowly turning rays.
    ctx.translate(cx, cy);
    ctx.rotate(this.time / 9000);
    ctx.fillStyle = sun.glow;
    for (let i = 0; i < 10; i++) {
      ctx.rotate(Math.PI * 2 / 10);
      ctx.beginPath();
      ctx.moveTo(-2, radius + 3);
      ctx.lineTo(2, radius + 3);
      ctx.lineTo(0, radius * 3.2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha * (1 - this.night);
    const glow = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius * 3.5);
    glow.addColorStop(0, sun.glow);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius * 4, cy - radius * 4, radius * 8, radius * 8);
    // Pixel disc.
    ctx.fillStyle = sun.color;
    for (let dy = -radius; dy <= radius; dy++) {
      const half = Math.round(Math.sqrt(radius * radius - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2, 1);
    }
    ctx.restore();
  }

  private drawMoon(ctx: CanvasRenderingContext2D, width: number) {
    if (this.night <= 0) {
      return;
    }
    const cx = Math.round(width * 0.22);
    const cy = 36;
    const r = 11;
    ctx.save();
    ctx.globalAlpha = this.night;
    const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 4);
    glow.addColorStop(0, 'rgba(255, 244, 200, 0.25)');
    glow.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
    // Crescent: the disc minus a shifted one.
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) {
          continue;
        }
        const ox = dx - 6;
        const oy = dy + 2;
        if (ox * ox + oy * oy < (r - 1) * (r - 1)) {
          continue;
        }
        ctx.fillStyle = dx > 4 ? '#f3dc8a' : '#fff1b8';
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    ctx.restore();
  }

  private drawLand(
      ctx: CanvasRenderingContext2D, biome: Biome, alpha: number,
      width: number, travel: number) {
    const art = this.world(biome);
    const strip =
        (image: HTMLCanvasElement, offset: number, y: number, a: number) => {
          ctx.globalAlpha = a;
          const start = -(Math.floor(offset) % STRIP);
          for (let x = start; x < width; x += STRIP) {
            ctx.drawImage(image, x, y);
          }
        };
    const cloudAlpha = alpha * (1 - this.night * 0.6);
    ctx.save();
    // Clouds drift on their own as well as with the run.
    strip(art.cloudsFar, travel * 0.04 + this.time * 0.003, 0,
          cloudAlpha * 0.75);
    for (const [layer, speed] of [
           [art.far, biome.far.speed],
           [art.near, biome.near.speed * 1.4],
         ] as const) {
      strip(layer.day, travel * speed, 0, alpha);
      if (this.night > 0) {
        strip(layer.night, travel * speed, 0, alpha * this.night);
      }
    }
    strip(art.cloudsNear, travel * 0.1 + this.time * 0.006, 8, cloudAlpha);
    if (biome.id === 'forest' && this.night < 1) {
      this.drawLightShafts(ctx, width, alpha * (1 - this.night));
    }
    ctx.restore();
  }

  /** Soft beams of sunlight through the forest. */
  private drawLightShafts(
      ctx: CanvasRenderingContext2D, width: number, alpha: number) {
    for (let i = 0; i < 4; i++) {
      const x = width * (0.15 + i * 0.24) + Math.sin(this.time / 3000 + i) * 6;
      const shimmer = 0.6 + 0.4 * Math.sin(this.time / 1300 + i * 2);
      const beam = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      beam.addColorStop(0, 'rgba(255, 255, 220, 0.16)');
      beam.addColorStop(1, 'rgba(255, 255, 220, 0)');
      ctx.globalAlpha = alpha * shimmer;
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x - 30, GROUND_Y);
      ctx.lineTo(x - 70, GROUND_Y);
      ctx.fill();
    }
  }

  private drawGround(
      ctx: CanvasRenderingContext2D, biome: Biome, alpha: number,
      width: number, travel: number) {
    const ground = this.world(biome).ground;
    ctx.save();
    ctx.globalAlpha = alpha;
    const start = -(Math.floor(travel) % GROUND_STRIP);
    for (let x = start; x < width; x += GROUND_STRIP) {
      ctx.drawImage(ground, x, GROUND_Y - TUFTS);
    }
    if (biome.id === 'volcano') {
      // The lava veins pulse.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (0.08 + 0.06 * Math.sin(this.time / 500));
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(0, GROUND_Y + 4, width, SCENE_HEIGHT - GROUND_Y);
    }
    ctx.restore();
  }

  private updateLife(deltaTime: number, groundMove: number, width: number) {
    const frames = deltaTime / (1000 / 60);

    if (this.biome.ambient === 'birds') {
      this.untilBirds -= deltaTime;
      if (this.untilBirds <= 0 && !this.birds.length) {
        const y = 30 + Math.random() * 60;
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
      const art = this.world(this.biome).far;
      this.untilPuff -= deltaTime;
      if (this.untilPuff <= 0) {
        const offset = Math.floor(this.travel * far.speed) % STRIP;
        for (const vent of art.vents) {
          const x = vent.x - offset;
          for (const sx of [x, x + STRIP]) {
            if (sx < -20 || sx > width + 20) {
              continue;
            }
            this.motes.push({
              x: sx, y: vent.y - 2, r: 2, age: 0, life: 4000,
              vx: -0.12, vy: -0.22, color: '#5b4352', gravity: 0,
            });
            // Now and then a burst of lava sparks.
            if (Math.random() < 0.25) {
              for (let i = 0; i < 6; i++) {
                this.motes.push({
                  x: sx, y: vent.y, r: 1, age: 0, life: 1000,
                  vx: (Math.random() - 0.5) * 1.2, vy: -1.2 - Math.random(),
                  color: '#ffb03a', gravity: 0.05,
                });
              }
            }
          }
        }
        this.untilPuff = 420;
      }
      const drift = far.speed * groundMove;
      for (const mote of this.motes) {
        mote.age += deltaTime;
        mote.x += mote.vx * frames - drift;
        mote.y += mote.vy * frames;
        mote.vy += mote.gravity * frames;
        if (mote.r > 1) {
          mote.r += 0.03 * frames;
        }
      }
      this.motes = this.motes.filter(mote => mote.age < mote.life);
    }

    if (this.biome.id === 'forest') {
      for (const f of this.fireflies) {
        f.phase += 0.02 * frames * f.speed;
        f.x += Math.cos(f.phase) * 0.3 * frames - groundMove * 0.3;
        f.y += Math.sin(f.phase * 1.3) * 0.2 * frames;
        if (f.x < -5) {
          f.x += width + 10;
        }
      }
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
    for (const mote of this.motes) {
      ctx.globalAlpha = (1 - mote.age / mote.life) * (mote.r === 1 ? 1 : 0.5);
      ctx.fillStyle = mote.color;
      const r = Math.round(mote.r);
      ctx.fillRect(
          Math.round(mote.x - r), Math.round(mote.y - r), r * 2, r * 2);
    }
    if (this.biome.id === 'forest' && this.night > 0) {
      for (const f of this.fireflies) {
        ctx.globalAlpha =
            this.night * (0.5 + 0.5 * Math.sin(this.time / 300 + f.phase * 5));
        ctx.fillStyle = '#e4ff8a';
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 2);
      }
    }
    ctx.restore();
  }
}
