/**
 * Tiny pixel art toolkit. Bitmaps are written as rows of palette characters
 * ('.' is transparent) and pre-rendered once to offscreen canvases.
 */

import type {SpritePalette} from './biomes.js';

/** Default colours, matching the Chrome sprite sheet. */
const DEFAULT_PALETTE: Record<string, string> = {
  '#': '#535353',
  '+': '#bababa',
  '-': '#dadada',
  'o': '#ffffff',
};

/** Rendering scale. Sprites stay sharp when the canvas is scaled up. */
const SCALE = 4;

export interface PixelSprite {
  canvas: HTMLCanvasElement;
  // Logical size, including the outline.
  width: number;
  height: number;
}

export interface SpriteOptions {
  palette?: Record<string, string>;
  // Colour of the 1px border around the shape, or null for none.
  outline?: string|null;
}

/**
 * Renders a bitmap to an offscreen canvas. With an outline, every empty
 * pixel next to a filled one gets the outline colour; the sprite then grows
 * by 1px on each side.
 */
export function createSprite(
    rows: string[], options: SpriteOptions = {}): PixelSprite {
  const palette = {...DEFAULT_PALETTE, ...options.palette};
  const outline =
      options.outline === undefined ? palette['o']! : options.outline;
  const pad = outline ? 1 : 0;
  const artWidth = Math.max(...rows.map(row => row.length));
  const width = artWidth + pad * 2;
  const height = rows.length + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;

  const filled = (x: number, y: number) => {
    const ch = rows[y]?.[x];
    return ch !== undefined && ch !== '.' && ch !== ' ';
  };

  for (let y = -pad; y < rows.length + pad; y++) {
    for (let x = -pad; x < artWidth + pad; x++) {
      let color: string|undefined;
      if (filled(x, y)) {
        color = palette[rows[y]![x]!];
      } else if (
          outline &&
          (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) ||
           filled(x, y + 1))) {
        color = outline;
      }
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect((x + pad) * SCALE, (y + pad) * SCALE, SCALE, SCALE);
      }
    }
  }
  return {canvas, width, height};
}

/**
 * Adds light and dark edges to a silhouette drawn with '#': 'L' on the top
 * and left edges, 'D' on the bottom and right ones (and 'C' for a snow cap
 * on top when asked). Other characters are left as they are.
 */
export function shade(rows: string[], cap = false): string[] {
  const body = (x: number, y: number) => {
    const ch = rows[y]?.[x];
    return ch !== undefined && ch !== '.' && ch !== ' ';
  };
  return rows.map((row, y) => [...row].map((ch, x) => {
    if (ch !== '#') {
      return ch;
    }
    if (cap && (!body(x, y - 1) || !body(x, y - 2))) {
      return 'C';
    }
    if (!body(x, y - 1) || !body(x - 1, y)) {
      return 'L';
    }
    if (!body(x, y + 1) || !body(x + 1, y)) {
      return 'D';
    }
    return '#';
  }).join(''));
}

/** Palette for shaded art from a sprite palette. */
export function paletteFor(colors: SpritePalette): Record<string, string> {
  return {
    '#': colors.base,
    'L': colors.light,
    'D': colors.dark,
    'C': colors.cap ?? colors.light,
  };
}

export function drawSprite(
    ctx: CanvasRenderingContext2D, sprite: PixelSprite, x: number, y: number) {
  ctx.drawImage(
      sprite.canvas, Math.round(x), Math.round(y), sprite.width,
      sprite.height);
}

/**
 * Rasterizes line segments into a square bitmap; used for shapes that are
 * easier to describe as geometry (and to rotate) than to draw by hand.
 */
export function rasterizeLines(
    size: number, lines: Array<[number, number, number, number]>,
    char = '#'): string[] {
  const grid: string[][] =
      Array.from({length: size}, () => Array(size).fill('.'));
  for (const [x0, y0, x1, y1] of lines) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps);
      const y = Math.round(y0 + (y1 - y0) * i / steps);
      if (x >= 0 && y >= 0 && x < size && y < size) {
        grid[y]![x] = char;
      }
    }
  }
  return grid.map(row => row.join(''));
}
