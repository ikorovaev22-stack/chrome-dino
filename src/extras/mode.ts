/**
 * Settings the page decides before the game starts.
 */

let extrasEnabled = true;
let canvasPixelRatio: number|null = null;

/** The classic page turns the extended game off before the Runner starts. */
export function disableExtras() {
  extrasEnabled = false;
}

/** Coins, power-ups, levels, colours. Off on the classic page. */
export function isExtrasEnabled(): boolean {
  return extrasEnabled;
}

/**
 * Canvas backing store pixels per game pixel. The game page draws the canvas
 * bigger than the original 600x150 and sets this so it stays sharp; null
 * keeps Chrome's own value (the device pixel ratio).
 */
export function setCanvasPixelRatio(ratio: number) {
  canvasPixelRatio = ratio;
}

export function getCanvasPixelRatio(): number|null {
  return canvasPixelRatio;
}
