// Game page: the coloured dino run with worlds, coins, power-ups and skins.

import '@fontsource/press-start-2p/400.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import './game.css';

import {loadTimeData} from './chrome_resources/js/load_time_data.js';
import {IS_HIDPI} from './dino_game/constants.js';
import {Runner} from './dino_game/offline.js';
import type {PowerUpKind} from './extras/art.js';
import {getSprites} from './extras/art.js';
import type {BiomeId} from './extras/biomes.js';
import {BIOMES, biomeForLevel, levelStart} from './extras/biomes.js';
import {on} from './extras/events.js';
import {setCanvasPixelRatio} from './extras/mode.js';
import {dinoPreview} from './extras/recolor.js';
import type {Skin} from './extras/skins.js';
import {getCoinBank, getSelectedSkin, isUnlocked, saveSelectedSkin, SKINS} from './extras/skins.js';
import {getSkin, initTheme, setSkin} from './extras/theme.js';
import {installHighScoreStore, readNumber} from './host.js';
import sheet1x from './images/default_100_percent/offline/100-offline-sprite.png';
import sheet2x from './images/default_200_percent/offline/200-offline-sprite.png';
import {getLanguage, getLoadTimeData} from './strings.js';

const HIGH_SCORE_KEY = 'chrome-dino:high-score-extended';
/** Score units per game pixel, as in the original distance meter. */
const SCORE_COEFFICIENT = 0.025;
const GAME_WIDTH = 600;
const GAME_HEIGHT = 150;

const POWER_UPS: Array<[PowerUpKind, string, string]> = [
  ['shield', 'Щит', 'Спасает от одного столкновения'],
  ['doubleJump', 'Двойной прыжок', '10 секунд можно прыгнуть ещё раз в воздухе'],
  ['magnet', 'Магнит', '10 секунд монеты сами летят к динозавру'],
  ['star', 'Звезда', '6 секунд неуязвимости, препятствия разлетаются: +25'],
  ['slowMotion', 'Замедление', '6 секунд всё движется медленнее'],
];

const WORLD_OBSTACLES: Record<BiomeId, string> = {
  desert: 'кактусы, камни, перекати-поле',
  canyon: 'кактусы, валуны, перекати-поле',
  forest: 'брёвна, пни, кусты-кактусы',
  snow: 'снеговики, снежки, ледяные глыбы',
  volcano: 'лавовые гейзеры, угли',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;

function pad(score: number): string {
  return String(Math.max(0, Math.round(score))).padStart(5, '0');
}

/**
 * Scales the 600x150 game to the page. The canvas is rendered at the final
 * resolution (see setCanvasPixelRatio), so pixels stay sharp.
 */
function layout() {
  const screen = $('screen');
  const stage = $('stage');
  const available = screen.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  // Backing store pixels per game pixel, in half steps.
  let ratio = Math.floor(available * dpr / GAME_WIDTH * 2) / 2;
  ratio = Math.min(ratio, Math.floor(window.innerHeight * 0.6 * dpr /
                                     GAME_HEIGHT * 2) / 2);
  ratio = Math.max(ratio, Math.ceil(dpr));
  const zoom = ratio / dpr;
  const width = Math.min(GAME_WIDTH, Math.floor(available / zoom));
  setCanvasPixelRatio(ratio);
  stage.style.width = `${width}px`;
  stage.style.transform = `scale(${zoom})`;
  stage.style.left = `${Math.round((available - width * zoom) / 2)}px`;
  screen.style.height = `${Math.round(GAME_HEIGHT * zoom)}px`;
  document.documentElement.style.setProperty('--zoom', String(zoom));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

function showToast(text: string) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3500);
}

function renderBest(extra = 0) {
  const stored = readNumber(HIGH_SCORE_KEY) * SCORE_COEFFICIENT;
  $('best').textContent = pad(Math.max(stored, extra));
}

function renderPowerUps() {
  const list = $('powerups');
  const icons = getSprites().icons;
  for (const [kind, name, text] of POWER_UPS) {
    const item = document.createElement('li');
    const icon = document.createElement('img');
    icon.className = 'pixel';
    icon.alt = '';
    icon.src = icons[kind].canvas.toDataURL();
    const label = document.createElement('div');
    label.innerHTML = '<b></b><span></span>';
    label.querySelector('b')!.textContent = name;
    label.querySelector('span')!.textContent = text;
    item.append(icon, label);
    list.append(item);
  }
  ($('coin-icon') as HTMLImageElement).src =
      getSprites().coin[0]!.canvas.toDataURL();
}

function renderWorlds() {
  const list = $('worlds');
  BIOMES.forEach((biome, i) => {
    const item = document.createElement('li');
    item.dataset['world'] = biome.id;
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.setProperty(
        '--sky', `linear-gradient(${biome.sky[0]}, ${biome.sky[1]})`);
    swatch.style.setProperty('--ground', biome.ground);
    const label = document.createElement('div');
    label.innerHTML = '<b></b><span></span>';
    label.querySelector('b')!.textContent = biome.name;
    label.querySelector('span')!.textContent =
        `${i === 0 ? 'Старт' : `С ${levelStart(i)} очков`} · ` +
        WORLD_OBSTACLES[biome.id];
    item.append(swatch, label);
    list.append(item);
  });
}

function renderSkins(original: HTMLImageElement, scale: 1|2) {
  const list = $('skins');
  const buttons = new Map<Skin, HTMLButtonElement>();
  const update = () => {
    const current = getSkin();
    for (const [skin, button] of buttons) {
      const unlocked = isUnlocked(skin);
      button.disabled = !unlocked;
      button.setAttribute('aria-pressed', String(skin === current));
      button.querySelector('small')!.textContent =
          unlocked ? (skin === current ? 'выбран' : 'открыт') :
                     `${skin.price} монет`;
    }
  };
  for (const skin of SKINS) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skin';
    const name = document.createElement('span');
    name.textContent = skin.name;
    button.append(dinoPreview(original, scale, skin), name,
                  document.createElement('small'));
    button.addEventListener('click', async () => {
      saveSelectedSkin(skin);
      await setSkin(skin);
      update();
      // Back to the game, so Space doesn't press the button again.
      button.blur();
    });
    buttons.set(skin, button);
    item.append(button);
    list.append(item);
  }
  update();
  return update;
}

async function main() {
  installHighScoreStore(HIGH_SCORE_KEY);
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch', touch);

  layout();
  window.addEventListener('resize', layout);

  // Keep the page from scrolling on the game keys.
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        !(e.target as HTMLElement).closest('button, a, input, textarea')) {
      e.preventDefault();
    }
    if ([' ', 'ArrowUp'].includes(e.key)) {
      document.body.classList.add('playing');
    }
  });
  $('screen').addEventListener('touchstart', () => {
    document.body.classList.add('playing');
  }, {passive: true});
  // A mouse click on the game shouldn't give it keyboard focus: in Chrome
  // that switches on the audio cue mode for screen reader users.
  $('screen').addEventListener('mousedown', e => e.preventDefault());

  const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  loadTimeData.data = getLoadTimeData(getLanguage(), isMobile);

  renderBest();
  $('bank').textContent = String(getCoinBank());
  renderPowerUps();
  renderWorlds();

  // Load the font before the canvas uses it for the level banner.
  document.fonts.load('8px "Press Start 2P"', 'УРОВЕНЬ').catch(() => {});

  on('level', ({level, biome, start, next}) => {
    $('level-number').textContent = `Уровень ${level + 1}`;
    $('level-world').textContent = biome.name;
    $('level-bar').dataset['start'] = String(start);
    $('level-bar').dataset['next'] = String(next);
    $('level-bar').style.width = '0%';
    $('level-next').textContent =
        `${biomeForLevel(level + 1).name} через ${next - start}`;
    const root = document.documentElement.style;
    root.setProperty('--world', biome.sky[0]);
    root.setProperty('--world-low', biome.sky[1]);
    for (const item of $('worlds').children) {
      item.classList.toggle(
          'current', (item as HTMLElement).dataset['world'] === biome.id);
    }
  });
  on('progress', ({distance}) => {
    const bar = $('level-bar');
    const start = Number(bar.dataset['start']);
    const next = Number(bar.dataset['next']);
    const done = Math.min(1, Math.max(0, (distance - start) / (next - start)));
    bar.style.width = `${done * 100}%`;
    $('level-next').textContent = $('level-next').textContent!.replace(
        /\d+$/, String(Math.max(0, next - distance)));
  });

  const scale = IS_HIDPI ? 2 : 1;
  const original = await loadImage(scale === 2 ? sheet2x : sheet1x);
  const firstSheet = await initTheme(original, scale, getSelectedSkin());
  const updateSkins = renderSkins(original, scale);

  on('gameover', ({score, bank, coins}) => {
    renderBest(score);
    $('bank').textContent = String(bank);
    const unlocked =
        SKINS.filter(skin => skin.price > bank - coins && skin.price <= bank);
    for (const skin of unlocked) {
      showToast(`Открыт скин «${skin.name}»! Выберите его в разделе «Скины».`);
    }
    updateSkins();
  });

  // The Runner picks up the sprite sheet from the page, as in Chrome.
  firstSheet.id = `offline-resources-${scale}x`;
  $('offline-resources').append(firstSheet);
  Runner.initializeInstance('#stage');
}

main();
