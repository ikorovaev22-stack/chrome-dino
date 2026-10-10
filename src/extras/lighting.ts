/**
 * Night lighting: darkness over the whole scene with soft holes of light
 * around the dino, coins, lava and fireflies, plus a warm glow on top.
 */

import type {Light} from './scenery.js';

export class Lighting {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;

  /**
   * @param darkness 0 (day) to 1 (darkest).
   */
  draw(
      target: CanvasRenderingContext2D, width: number, height: number,
      darkness: number, lights: Light[]) {
    if (darkness <= 0.01) {
      return;
    }
    // The light map is low resolution; it's only soft gradients.
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(6, 9, 26, ${0.62 * darkness})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const glow = ctx.createRadialGradient(
          light.x, light.y, 0, light.x, light.y, light.radius);
      glow.addColorStop(0, 'rgba(0, 0, 0, 1)');
      glow.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(
          light.x - light.radius, light.y - light.radius, light.radius * 2,
          light.radius * 2);
    }

    target.save();
    target.imageSmoothingEnabled = true;
    target.drawImage(this.canvas, 0, 0, width, height);
    // Coloured lights add a warm tint around themselves.
    target.globalCompositeOperation = 'lighter';
    for (const light of lights) {
      if (!light.color) {
        continue;
      }
      const r = light.radius * 0.8;
      const glow =
          target.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
      glow.addColorStop(0, light.color);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      target.globalAlpha = 0.22 * darkness;
      target.fillStyle = glow;
      target.fillRect(light.x - r, light.y - r, r * 2, r * 2);
    }
    target.restore();
  }
}
