/**
 * Drawing helpers for the in-game interface: quiet colours, a pixel font,
 * panels with cut corners, and buttons that register their hit areas.
 */

export const UI = {
  font: '"Press Start 2P", ui-monospace, monospace',
  text: '#ece7da',
  muted: '#a19eac',
  dim: '#6d6a78',
  accent: '#e8c170',
  shadow: '#15131b',
  panel: 'rgba(17, 18, 24, 0.88)',
  panelLine: '#3a3d4c',
  panelHighlight: '#4c5064',
  select: 'rgba(232, 193, 112, 0.12)',
  danger: '#e5484d',
  good: '#7ccf8a',
};

export interface TextOptions {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: boolean;
  alpha?: number;
}

export function text(
    ctx: CanvasRenderingContext2D, value: string, x: number, y: number,
    options: TextOptions = {}) {
  const size = options.size ?? 8;
  ctx.save();
  ctx.font = `${size}px ${UI.font}`;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'top';
  ctx.globalAlpha *= options.alpha ?? 1;
  if (options.shadow !== false) {
    ctx.fillStyle = UI.shadow;
    const offset = Math.max(1, Math.round(size / 8));
    ctx.fillText(value, Math.round(x) + offset, Math.round(y) + offset);
  }
  ctx.fillStyle = options.color ?? UI.text;
  ctx.fillText(value, Math.round(x), Math.round(y));
  ctx.restore();
}

export function textWidth(
    ctx: CanvasRenderingContext2D, value: string, size = 8): number {
  ctx.save();
  ctx.font = `${size}px ${UI.font}`;
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}

/** Splits text into lines that fit a width. */
export function wrap(
    ctx: CanvasRenderingContext2D, value: string, width: number,
    size = 8): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(ctx, next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

/** A dark panel with a thin border and cut corners. */
export function panel(
    ctx: CanvasRenderingContext2D, x: number, y: number, width: number,
    height: number, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = UI.panel;
  ctx.fillRect(x + 2, y, width - 4, height);
  ctx.fillRect(x, y + 2, width, height - 4);
  ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = UI.panelLine;
  ctx.fillRect(x + 2, y, width - 4, 1);
  ctx.fillRect(x + 2, y + height - 1, width - 4, 1);
  ctx.fillRect(x, y + 2, 1, height - 4);
  ctx.fillRect(x + width - 1, y + 2, 1, height - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + width - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + height - 2, 1, 1);
  ctx.fillRect(x + width - 2, y + height - 2, 1, 1);
  ctx.fillStyle = UI.panelHighlight;
  ctx.fillRect(x + 2, y + 1, width - 4, 1);
  ctx.restore();
}

export interface HitArea {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  action: () => void;
}

/**
 * A menu entry: highlighted with a bar and a bobbing marker when selected.
 */
export function button(
    ctx: CanvasRenderingContext2D, areas: HitArea[], label: string,
    options: {
      x: number,
      y: number,
      width: number,
      selected: boolean,
      index: number,
      action: () => void,
      enabled?: boolean,
      time: number,
      align?: 'center'|'left',
    }) {
  const height = 14;
  const {x, y, width, selected} = options;
  const enabled = options.enabled ?? true;
  if (selected) {
    ctx.save();
    ctx.fillStyle = UI.select;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), height);
    ctx.fillStyle = UI.accent;
    ctx.fillRect(Math.round(x), Math.round(y), 1, height);
    ctx.restore();
  }
  const color = !enabled ? UI.dim : selected ? UI.accent : UI.muted;
  const center = options.align !== 'left';
  const tx = center ? x + width / 2 : x + 12;
  text(ctx, label, tx, y + 3, {color, align: center ? 'center' : 'left'});
  if (selected) {
    const bob = Math.round(Math.sin(options.time / 160) * 1.5);
    const markerX = center ? tx - textWidth(ctx, label) / 2 - 12 + bob : x + 4;
    text(ctx, '›', markerX, y + 3, {color: UI.accent});
  }
  areas.push({
    x, y, width, height,
    index: options.index,
    action: options.action,
  });
}

export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

export function pad(score: number): string {
  return String(Math.max(0, Math.round(score))).padStart(5, '0');
}
