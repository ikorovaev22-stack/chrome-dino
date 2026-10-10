/**
 * Night lighting: darkness over the whole scene with soft holes of light
 * around the dino, coins, lava and fireflies, plus a warm glow on top.
 *
 * It's all soft gradients, so it doesn't need the screen's resolution. Each
 * layer is its own small canvas in game pixels, and CSS stretches it over the
 * scene: the browser's compositor scales it on the GPU for free, where
 * drawing it into a high resolution canvas cost a full-screen smoothed blit
 * every frame. The glow canvas is added to what's below with
 * `mix-blend-mode: plus-lighter` (see game.css).
 */

import type {Light} from './scenery.js';

/** Glow strength at full darkness. */
const GLOW_ALPHA = 0.22;
/** Coloured glow radius relative to the light's radius. */
const GLOW_RADIUS = 0.8;

export class Lighting {
  private shade: CanvasRenderingContext2D;
  private glow: CanvasRenderingContext2D;
  private visible = true;

  /**
   * @param shade Canvas for the darkness.
   * @param glow Canvas for the coloured glows, blended additively.
   */
  constructor(shade: HTMLCanvasElement, glow: HTMLCanvasElement) {
    this.shade = shade.getContext('2d')!;
    this.glow = glow.getContext('2d')!;
  }

  /**
   * @param darkness 0 (day) to 1 (darkest).
   */
  draw(width: number, height: number, darkness: number, lights: Light[]) {
    // In daylight the layers are hidden, so the compositor skips them.
    this.setVisible(darkness > 0.01);
    if (!this.visible) {
      return;
    }
    for (const {canvas} of [this.shade, this.glow]) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    const shade = this.shade;
    shade.globalCompositeOperation = 'source-over';
    shade.clearRect(0, 0, width, height);
    shade.fillStyle = `rgba(6, 9, 26, ${0.62 * darkness})`;
    shade.fillRect(0, 0, width, height);
    shade.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const glow = shade.createRadialGradient(
          light.x, light.y, 0, light.x, light.y, light.radius);
      glow.addColorStop(0, 'rgba(0, 0, 0, 1)');
      glow.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      shade.fillStyle = glow;
      shade.fillRect(
          light.x - light.radius, light.y - light.radius, light.radius * 2,
          light.radius * 2);
    }

    // Coloured lights add a warm tint around themselves.
    const tint = this.glow;
    tint.clearRect(0, 0, width, height);
    tint.globalCompositeOperation = 'lighter';
    tint.globalAlpha = GLOW_ALPHA * darkness;
    for (const light of lights) {
      if (!light.color) {
        continue;
      }
      const r = light.radius * GLOW_RADIUS;
      const glow =
          tint.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
      glow.addColorStop(0, light.color);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      tint.fillStyle = glow;
      tint.fillRect(light.x - r, light.y - r, r * 2, r * 2);
    }
  }

  private setVisible(visible: boolean) {
    if (visible !== this.visible) {
      this.visible = visible;
      this.shade.canvas.hidden = !visible;
      this.glow.canvas.hidden = !visible;
    }
  }
}
