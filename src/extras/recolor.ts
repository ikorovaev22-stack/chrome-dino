/**
 * Builds coloured versions of Chrome's grey sprite sheet. Every sprite keeps
 * its exact shape; grey bodies get a palette with light and dark edges, the
 * white border becomes a dark outline, and white details inside (eyes, the
 * restart arrow) stay white.
 */

import {spriteDefinitionByType} from '../dino_game/offline_sprite_definitions.js';

import type {Biome, SpritePalette} from './biomes.js';
import type {Skin} from './skins.js';

type RGB = [number, number, number];

function hex(color: string): RGB {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WHITE = hex('#ffffff');
const PTERODACTYL: SpritePalette = {
  base: '#b0603a',
  light: '#d88a5a',
  dark: '#86442a',
  outline: '#3d1d10',
};

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

class Sheet {
  readonly width: number;
  readonly height: number;
  private src: Uint8ClampedArray;
  readonly out: Uint8ClampedArray<ArrayBuffer>;

  constructor(data: ImageData) {
    this.width = data.width;
    this.height = data.height;
    this.src = data.data;
    this.out = new Uint8ClampedArray(data.data);
  }

  private index(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return 0;
    }
    return this.src[this.index(x, y) + 3]!;
  }

  /** Grey sprite body. */
  isBody(x: number, y: number): boolean {
    return this.alpha(x, y) > 128 && this.src[this.index(x, y)]! < 150;
  }

  /** White border or white detail. */
  isLight(x: number, y: number): boolean {
    return this.alpha(x, y) > 128 && this.src[this.index(x, y)]! >= 150;
  }

  set(x: number, y: number, color: RGB, alpha?: number) {
    const i = this.index(x, y);
    this.out[i] = color[0];
    this.out[i + 1] = color[1];
    this.out[i + 2] = color[2];
    this.out[i + 3] = alpha ?? this.src[i + 3]!;
  }

}

/**
 * Recolours a sprite with a palette. `step` is the size of one original
 * pixel in the sheet (2 on the high density sheet).
 */
function paintSprite(
    sheet: Sheet, rect: Rect, palette: SpritePalette, step: number) {
  const base = hex(palette.base);
  const light = hex(palette.light);
  const dark = hex(palette.dark);
  const outline = hex(palette.outline);
  const cap = palette.cap ? hex(palette.cap) : null;
  const inRect = (x: number, y: number) =>
      x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1;

  // White pixels reachable from the outside are the border; the rest are
  // details inside the sprite.
  const width = rect.x1 - rect.x0;
  const border = new Uint8Array(width * (rect.y1 - rect.y0));
  const key = (x: number, y: number) => (y - rect.y0) * width + (x - rect.x0);
  const queue: Array<[number, number]> = [];
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      if (sheet.isLight(x, y) &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
              ([dx, dy]) => sheet.alpha(x + dx!, y + dy!) < 128)) {
        border[key(x, y)] = 1;
        queue.push([x, y]);
      }
    }
  }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (inRect(nx, ny) && !border[key(nx, ny)] && sheet.isLight(nx, ny)) {
        border[key(nx, ny)] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      if (sheet.isBody(x, y)) {
        const topEdge = !sheet.isBody(x, y - step);
        if (cap && (topEdge || !sheet.isBody(x, y - step * 2))) {
          sheet.set(x, y, cap);
        } else if (topEdge || !sheet.isBody(x - step, y)) {
          sheet.set(x, y, light);
        } else if (
            !sheet.isBody(x, y + step) || !sheet.isBody(x + step, y)) {
          sheet.set(x, y, dark);
        } else {
          sheet.set(x, y, base);
        }
      } else if (sheet.isLight(x, y)) {
        sheet.set(x, y, border[key(x, y)] ? outline : WHITE);
      }
    }
  }
}

/** Empties a region of the sheet. */
function clear(sheet: Sheet, rect: Rect) {
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      if (sheet.alpha(x, y) > 0) {
        sheet.set(x, y, [0, 0, 0], 0);
      }
    }
  }
}

function regions(scale: 1|2, width: number) {
  const def = scale === 2 ? spriteDefinitionByType.original.hdpi :
                            spriteDefinitionByType.original.ldpi;
  const line = spriteDefinitionByType.original.lines[0]!;
  const top = line.sourceY * scale;
  const col = (x0: number, x1: number): Rect => ({x0, x1, y0: 0, y1: top});
  return {
    leftDino: col(0, def.cloud.x),
    cloud: col(def.cloud.x, def.pterodactyl.x),
    pterodactyl: col(def.pterodactyl.x, def.cactusSmall.x),
    cacti: col(def.cactusSmall.x, def.moon.x),
    moon: col(def.moon.x, def.star.x),
    star: col(def.star.x, def.textSprite.x),
    digits: {
      x0: def.textSprite.x,
      x1: def.textSprite.x + 120 * scale,
      y0: def.textSprite.y,
      y1: def.textSprite.y + 13 * scale,
    },
    gameOver: {
      x0: def.textSprite.x,
      x1: def.tRex.x,
      y0: def.textSprite.y + 13 * scale,
      y1: top,
    },
    tRex: col(def.tRex.x, width),
    horizon: {x0: 0, x1: width, y0: top, y1: top + line.height * scale},
    restart: {x0: 0, x1: width, y0: def.restart.y, y1: def.restart.y + 32 * scale},
  };
}

/**
 * Returns the coloured sprite sheet for a world and dino skin.
 */
export async function buildSheet(
    original: HTMLImageElement, scale: 1|2, biome: Biome,
    skin: Skin): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = original.naturalWidth;
  canvas.height = original.naturalHeight;
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(original, 0, 0);
  const sheet = new Sheet(ctx.getImageData(0, 0, canvas.width, canvas.height));
  const r = regions(scale, canvas.width);

  paintSprite(sheet, r.leftDino, skin.palette, scale);
  paintSprite(sheet, r.tRex, skin.palette, scale);
  paintSprite(sheet, r.pterodactyl, PTERODACTYL, scale);
  paintSprite(sheet, r.cacti, biome.cactus, scale);
  // The game page draws its own sky, ground, score and menus: Chrome's
  // clouds, moon, stars, horizon line, digits and restart button stay empty.
  for (const rect of [
         r.cloud, r.moon, r.star, r.digits, r.gameOver, r.horizon, r.restart,
       ]) {
    clear(sheet, rect);
  }

  ctx.putImageData(
      new ImageData(sheet.out, sheet.width, sheet.height), 0, 0);
  const image = new Image();
  image.src = canvas.toDataURL('image/png');
  await image.decode();
  return image;
}

/**
 * The standing dino in a skin's colours, for the skin picker.
 */
export function dinoPreview(
    original: HTMLImageElement, scale: 1|2, skin: Skin): HTMLCanvasElement {
  const def = scale === 2 ? spriteDefinitionByType.original.hdpi :
                            spriteDefinitionByType.original.ldpi;
  const width = 44 * scale;
  const height = 47 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(
      original, def.tRex.x, def.tRex.y, width, height, 0, 0, width, height);
  const sheet = new Sheet(ctx.getImageData(0, 0, width, height));
  paintSprite(sheet, {x0: 0, x1: width, y0: 0, y1: height}, skin.palette, scale);
  ctx.putImageData(new ImageData(sheet.out, width, height), 0, 0);
  return canvas;
}
