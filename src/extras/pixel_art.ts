/**
 * Tiny pixel art toolkit. Bitmaps are written as rows of palette characters
 * and drawn in the colours of the Chrome sprite sheet, so the new graphics
 * match the original ones (and invert the same way in night and dark mode).
 */

const PALETTE: Record<string, string> = {
  '#': '#535353',  // Main sprite colour.
  '+': '#bababa',  // Stars.
  '-': '#dadada',  // Moon, light fills.
  'o': '#ffffff',  // Outline / highlights.
};

/** Rendering scale. Sprites stay sharp on high density screens. */
const SCALE = 2;

export interface PixelSprite {
  canvas: HTMLCanvasElement;
  // Logical size, including the outline.
  width: number;
  height: number;
}

/**
 * Renders a bitmap to an offscreen canvas. With `outline`, every empty pixel
 * next to a filled one is painted white, like the 1px border around the
 * original sprites; the sprite then grows by 1px on each side.
 */
export function createSprite(rows: string[], outline = true): PixelSprite {
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
    return ch !== undefined && ch !== '.';
  };

  for (let y = -pad; y < rows.length + pad; y++) {
    for (let x = -pad; x < artWidth + pad; x++) {
      let color: string|undefined;
      if (filled(x, y)) {
        color = PALETTE[rows[y]![x]!];
      } else if (
          outline &&
          (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) ||
           filled(x, y + 1))) {
        color = PALETTE['o'];
      }
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect((x + pad) * SCALE, (y + pad) * SCALE, SCALE, SCALE);
      }
    }
  }
  return {canvas, width, height};
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
    size: number, lines: Array<[number, number, number, number]>): string[] {
  const grid: string[][] =
      Array.from({length: size}, () => Array(size).fill('.'));
  for (const [x0, y0, x1, y1] of lines) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps);
      const y = Math.round(y0 + (y1 - y0) * i / steps);
      if (x >= 0 && y >= 0 && x < size && y < size) {
        grid[y]![x] = '#';
      }
    }
  }
  return grid.map(row => row.join(''));
}
