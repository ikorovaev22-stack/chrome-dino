// Game page: Chrome's dino run inside a drawn world, with the game's own
// menus, HUD, upgrades and skins (see ui/app.ts).

import '@fontsource/press-start-2p/400.css';
import './game.css';

import {loadTimeData} from './chrome_resources/js/load_time_data.js';
import {IS_HIDPI} from './dino_game/constants.js';
import {Runner} from './dino_game/offline.js';
import type {Extras} from './extras/extras.js';
import {setCanvasPixelRatio} from './extras/mode.js';
import {SCENE_HEIGHT} from './extras/scenery.js';
import {getSelectedSkin} from './extras/skins.js';
import {initTheme} from './extras/theme.js';
import {installHighScoreStore} from './host.js';
import sheet1x from './images/default_100_percent/offline/100-offline-sprite.png';
import sheet2x from './images/default_200_percent/offline/200-offline-sprite.png';
import {getLanguage, getLoadTimeData} from './strings.js';
import {App} from './ui/app.js';

const HIGH_SCORE_KEY = 'chrome-dino:high-score-extended';
/** The game is never wider than Chrome's, so it plays the same. */
const MAX_WIDTH = 600;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;

/** Fullscreen, or opened from the home screen without the browser's bars. */
function isImmersive(): boolean {
  return !!document.fullscreenElement ||
      matchMedia('(display-mode: standalone), (display-mode: fullscreen)')
          .matches ||
      // Safari on iOS before display-mode support.
      (navigator as Navigator & {standalone?: boolean}).standalone === true;
}

/**
 * Fits the scene to the window, inside the safe area (the body's padding).
 * Canvases are rendered at the final resolution (see setCanvasPixelRatio),
 * so the pixel art stays sharp.
 */
function layout(): {width: number, ratio: number} {
  const immersive = isImmersive();
  const body = getComputedStyle(document.body);
  const safeWidth = window.innerWidth - parseFloat(body.paddingLeft) -
      parseFloat(body.paddingRight);
  const safeHeight = window.innerHeight - parseFloat(body.paddingTop) -
      parseFloat(body.paddingBottom);
  const footer =
      immersive ? 0 : document.querySelector('.footer')!.clientHeight;
  const availableWidth = safeWidth - (immersive ? 0 : 16);
  const availableHeight = safeHeight - footer - (immersive ? 0 : 24);
  const dpr = window.devicePixelRatio || 1;
  // Backing store pixels per game pixel, in half steps.
  let ratio = Math.floor(availableWidth * dpr / MAX_WIDTH * 2) / 2;
  ratio = Math.min(
      ratio, Math.floor(availableHeight * dpr / SCENE_HEIGHT * 2) / 2);
  ratio = Math.max(ratio, Math.ceil(dpr));
  const zoom = ratio / dpr;
  const width = Math.min(MAX_WIDTH, Math.floor(availableWidth / zoom));
  setCanvasPixelRatio(ratio);

  const viewport = $('viewport');
  viewport.style.width = `${Math.round(width * zoom)}px`;
  viewport.style.height = `${Math.round(SCENE_HEIGHT * zoom)}px`;
  const world = $('world');
  world.style.width = `${width}px`;
  world.style.height = `${SCENE_HEIGHT}px`;
  world.style.transform = `scale(${zoom})`;
  $('stage').style.width = `${width}px`;
  return {width, ratio};
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

/** The Runner starts once its sprite sheet has loaded. */
function whenStarted(runner: Runner): Promise<Extras> {
  return new Promise(resolve => {
    const check = () => {
      const extras = runner.getExtras();
      if (extras) {
        resolve(extras);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

async function main() {
  // Offline play from the home screen (see service_worker.js).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  installHighScoreStore(HIGH_SCORE_KEY);
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  loadTimeData.data = getLoadTimeData(getLanguage(), isMobile);

  let size = layout();
  // A mouse click on the game shouldn't give it keyboard focus: in Chrome
  // that switches on the audio cue mode for screen reader users.
  $('viewport').addEventListener('mousedown', e => {
    if (!(e.target as HTMLElement).closest('button')) {
      e.preventDefault();
    }
  });

  // The interface is drawn with the pixel font (Latin and Cyrillic parts).
  const font = document.fonts.load('8px "Press Start 2P"', 'Aa Дд 0').catch(
      () => {});

  const scale = IS_HIDPI ? 2 : 1;
  const original = await loadImage(scale === 2 ? sheet2x : sheet1x);
  const firstSheet = await initTheme(original, scale, getSelectedSkin());

  // The Runner picks up the sprite sheet from the page, as in Chrome.
  firstSheet.id = `offline-resources-${scale}x`;
  $('offline-resources').append(firstSheet);
  const runner = Runner.initializeInstance('#stage');
  const extras = await whenStarted(runner);
  await font;

  const app = new App({
    runner,
    extras,
    scene: $<HTMLCanvasElement>('scene'),
    fx: $<HTMLCanvasElement>('fx'),
    shade: $<HTMLCanvasElement>('shade'),
    glow: $<HTMLCanvasElement>('glow'),
    viewport: $('viewport'),
    pauseButton: $<HTMLButtonElement>('pause'),
    sheet: original,
    scale,
    highScoreKey: HIGH_SCORE_KEY,
    touch,
    canFullscreen: document.fullscreenEnabled,
    toggleFullscreen,
  });
  app.setSize(size.width, size.ratio);
  $('loading').remove();

  window.addEventListener('resize', () => {
    size = layout();
    app.setSize(size.width, size.ratio);
  });
}

main();
