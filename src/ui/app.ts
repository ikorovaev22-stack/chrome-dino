/**
 * The game's own interface, drawn on canvases around Chrome's game: the
 * scene behind it, and on top the lighting, weather, HUD and menus (title,
 * pause, results, upgrades, skins, help). Owns the keyboard while a menu is
 * open; during a run the keys go to the game.
 */

import type {Runner} from '../dino_game/offline.js';
import type {PowerUpKind} from '../extras/art.js';
import {getSprites, POWER_UP_COLORS} from '../extras/art.js';
import {biomeForLevel, levelStart} from '../extras/biomes.js';
import type {RunResult} from '../extras/events.js';
import {on} from '../extras/events.js';
import type {Extras} from '../extras/extras.js';
import {Lighting} from '../extras/lighting.js';
import {obstacleLight} from '../extras/obstacles.js';
import {drawSprite} from '../extras/pixel_art.js';
import {dinoPreview} from '../extras/recolor.js';
import type {Light} from '../extras/scenery.js';
import {SCENE_HEIGHT, Scenery, STRIP_TOP} from '../extras/scenery.js';
import {Sfx} from '../extras/sfx.js';
import type {Skin} from '../extras/skins.js';
import {buySkin, buyUpgrade, getCoinBank, isOwned, saveSelectedSkin, SKINS} from '../extras/skins.js';
import {getSkin, setSkin} from '../extras/theme.js';
import {maxLevel, nextPrice, upgradeLevel, UPGRADES} from '../extras/upgrades.js';
import {Weather} from '../extras/weather.js';
import {readNumber} from '../host.js';

import type {HitArea} from './draw.js';
import {button, easeOut, pad, panel, text, textWidth, UI, wrap} from './draw.js';

/** Score units per game pixel, as in the original distance meter. */
const SCORE_COEFFICIENT = 0.025;
/** The crash plays out before the results appear. */
const DEATH_MS = 900;

const POWER_UP_NAMES: Record<PowerUpKind, string> = {
  shield: 'Щит',
  doubleJump: 'Двойной прыжок',
  magnet: 'Магнит',
  star: 'Звезда',
  slowMotion: 'Замедление',
  heart: '+1 сердце',
};

const POWER_UP_HELP: Array<[PowerUpKind, string]> = [
  ['heart', 'возвращает сердце'],
  ['shield', 'спасает от удара'],
  ['doubleJump', 'прыжок в воздухе'],
  ['magnet', 'тянет монеты'],
  ['star', 'неуязвимость'],
  ['slowMotion', 'время медленнее'],
];

/** The Up key, as the game reads it (keyCode), for taps outside its strip. */
function jumpKey(type: 'keydown'|'keyup'): KeyboardEvent {
  const event = new KeyboardEvent(type, {key: 'ArrowUp', code: 'ArrowUp'});
  Object.defineProperty(event, 'keyCode', {value: 38});
  return event;
}

type Screen = 'title'|'play'|'pause'|'over'|'shop'|'skins'|'help';

interface FlyingCoin {
  x: number;
  y: number;
  age: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

export interface AppOptions {
  runner: Runner;
  extras: Extras;
  scene: HTMLCanvasElement;
  fx: HTMLCanvasElement;
  // Night lighting layers between the game and the interface.
  shade: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  viewport: HTMLElement;
  pauseButton: HTMLButtonElement;
  // Chrome's sprite sheet, for the skin previews.
  sheet: HTMLImageElement;
  scale: 1|2;
  highScoreKey: string;
  touch: boolean;
  canFullscreen: boolean;
  toggleFullscreen: () => void;
}

export class App {
  private runner: Runner;
  private extras: Extras;
  private sceneCtx: CanvasRenderingContext2D;
  private fxCtx: CanvasRenderingContext2D;
  private options: AppOptions;
  private scenery: Scenery;
  private weather: Weather;
  private lighting: Lighting;
  private sfx = new Sfx();

  private screen: Screen = 'title';
  // Where Esc leads from the upgrades, skins and help screens.
  private back: Screen = 'title';
  private backSelected: number = 0;
  private selected: number = 0;
  private areas: HitArea[] = [];
  private width: number = 600;
  private time: number = 0;
  private lastRender: number = 0;
  private screenAt: number = 0;
  private lastTravel: number = 0;

  // HUD animation state.
  private shownCoins: number = 0;
  private coinBump: number = 0;
  private heartShake: number = 0;
  private heartFlash: number = 0;
  private hurtFlash: number = 0;
  private flying: FlyingCoin[] = [];
  private floats: FloatText[] = [];
  private banner: {level: number, name: string, age: number}|null = null;
  private result: (RunResult&{best: number, record: boolean})|null = null;
  private notice: {text: string, age: number}|null = null;
  private previews = new Map<string, HTMLCanvasElement>();

  constructor(options: AppOptions) {
    this.options = options;
    this.runner = options.runner;
    this.extras = options.extras;
    this.sceneCtx = options.scene.getContext('2d')!;
    this.fxCtx = options.fx.getContext('2d')!;
    this.lighting = new Lighting(options.shade, options.glow);
    this.scenery = new Scenery(this.extras.biome);
    this.weather = new Weather(() => this.width, SCENE_HEIGHT);
    this.weather.reset(this.extras.biome);
    this.listen();
    this.extras.onFrame = () => this.render();
    this.setScreen('title');
    requestAnimationFrame(this.tick);
  }

  /** New canvas size: logical width and backing pixels per game pixel. */
  setSize(width: number, ratio: number) {
    this.width = width;
    for (const canvas of [this.options.scene, this.options.fx]) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(SCENE_HEIGHT * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${SCENE_HEIGHT}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    this.render();
  }

  // Events from the game.

  private listen() {
    on('level', ({level, biome, initial}) => {
      this.scenery.setBiome(biome, initial);
      if (initial) {
        this.weather.reset(biome);
      } else {
        this.weather.setBiome(biome);
        this.banner = {level, name: biome.name, age: 0};
      }
      // Build the next world's background ahead of time.
      setTimeout(() => this.scenery.prepare(biomeForLevel(level + 1)), 500);
    });
    on('start', () => {
      this.shownCoins = 0;
      this.flying = [];
      this.floats = [];
      this.banner = null;
      this.result = null;
    });
    on('coin', ({x, y}) => {
      this.flying.push({x, y: y + STRIP_TOP, age: 0});
    });
    on('powerup', ({kind, x, y}) => {
      this.float(POWER_UP_NAMES[kind], x, y + STRIP_TOP - 14,
                 POWER_UP_COLORS[kind].light);
    });
    on('hurt', ({hearts}) => {
      this.hurtFlash = 1;
      this.heartShake = 1;
      if (hearts > 0) {
        const {x, y} = this.extras.dinoCenter();
        this.float('-1', x, y + STRIP_TOP - 30, UI.danger);
      }
    });
    on('heal', () => {
      this.heartFlash = 1;
    });
    on('shieldbreak', () => {
      const {x, y} = this.extras.dinoCenter();
      this.float('Щит!', x, y + STRIP_TOP - 30, POWER_UP_COLORS.shield.light);
    });
    on('pause', () => {
      if (this.screen === 'play') {
        this.setScreen('pause');
      }
    });
    on('gameover', result => {
      const best = readNumber(this.options.highScoreKey) * SCORE_COEFFICIENT;
      this.result = {
        ...result,
        best: Math.max(best, result.score),
        record: result.score > best && result.score > 0,
      };
      this.shownCoins = result.coins;
      this.flying = [];
      this.setScreen('over');
      const viewport = this.options.viewport;
      viewport.classList.remove('shake');
      void viewport.offsetWidth;
      viewport.classList.add('shake');
    });

    window.addEventListener('keydown', e => this.onKeyDown(e), true);
    window.addEventListener('keyup', e => this.onKeyUp(e), true);
    const fx = this.options.fx;
    fx.addEventListener('pointermove', e => {
      const area = this.hit(e);
      if (area && area.index !== this.selected) {
        this.selected = area.index;
      }
    });
    fx.addEventListener('pointerdown', e => {
      const area = this.hit(e);
      if (area) {
        e.preventDefault();
        this.selected = area.index;
        area.action();
      }
    });
    this.options.pauseButton.addEventListener('click', () => this.pause());

    // During a run a tap anywhere on the screen jumps; the game itself only
    // listens on its own strip.
    const viewport = this.options.viewport;
    const isGameStrip = (target: EventTarget|null) =>
        target instanceof Element && !!target.closest('.runner-container');
    viewport.addEventListener('touchstart', e => {
      if (this.screen !== 'play' || isGameStrip(e.target) ||
          e.target === this.options.pauseButton) {
        return;
      }
      e.preventDefault();
      document.dispatchEvent(jumpKey('keydown'));
    }, {passive: false});
    viewport.addEventListener('touchend', e => {
      if (this.screen !== 'play' || isGameStrip(e.target)) {
        return;
      }
      document.dispatchEvent(jumpKey('keyup'));
    });
  }

  private float(value: string, x: number, y: number, color: string) {
    this.floats.push({x, y, text: value, color, age: 0});
  }

  private hit(e: PointerEvent): HitArea|undefined {
    const x = e.offsetX;
    const y = e.offsetY;
    return this.areas.find(
        a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
  }

  // Screens and actions.

  private setScreen(screen: Screen) {
    this.screen = screen;
    this.selected = 0;
    this.notice = null;
    this.screenAt = this.time;
    this.areas = [];
    const playing = screen === 'play';
    this.options.fx.classList.toggle('passive', playing);
    this.options.pauseButton.hidden = !playing;
    // Lay out the new screen now, so keys pressed right away find its items.
    this.render();
  }

  private startRun() {
    this.setScreen('play');
    this.runner.startRun();
  }

  private pause() {
    if (this.screen !== 'play') {
      return;
    }
    this.runner.pauseRun();
    this.setScreen('pause');
  }

  private resume() {
    this.setScreen('play');
    this.runner.resumeRun();
  }

  private open(screen: 'shop'|'skins'|'help') {
    this.back = this.screen;
    this.backSelected = this.selected;
    this.setScreen(screen);
    this.sfx.select();
  }

  private goBack() {
    this.setScreen(this.back);
    this.selected = this.backSelected;
    if (this.back === 'over') {
      // The results are already shown; don't play the crash again.
      this.screenAt -= DEATH_MS + 1200;
    }
    this.sfx.select();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.code === 'KeyF' && !e.repeat && this.options.canFullscreen) {
      e.preventDefault();
      this.options.toggleFullscreen();
      return;
    }
    if (this.screen === 'play') {
      if (e.key === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.pause();
      } else if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        // Keep the page still; the game still gets the key.
        e.preventDefault();
      }
      return;
    }
    // Menus own the keyboard.
    e.preventDefault();
    e.stopImmediatePropagation();
    const count = this.areas.length;
    const grid = this.screen === 'skins' && this.selected < SKINS.length;
    switch (e.key) {
      case 'ArrowUp':
        this.move(grid ? -3 : -1, count);
        break;
      case 'ArrowDown':
        this.move(grid ? 3 : 1, count);
        break;
      case 'ArrowLeft':
        this.move(-1, count);
        break;
      case 'ArrowRight':
        this.move(1, count);
        break;
      case 'Enter':
      case ' ':
        if (!e.repeat) {
          this.activate();
        }
        break;
      case 'Escape':
        this.escape();
        break;
      default:
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    if (this.screen !== 'play') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  private move(step: number, count: number) {
    if (!count) {
      return;
    }
    this.selected = Math.min(count - 1, Math.max(0, this.selected + step));
    this.sfx.select();
  }

  private activate() {
    if (this.screen === 'over' && this.time - this.screenAt < DEATH_MS + 400) {
      // Don't restart by accident while still pressing jump.
      return;
    }
    this.areas.find(a => a.index === this.selected)?.action();
  }

  private escape() {
    switch (this.screen) {
      case 'pause':
        this.resume();
        break;
      case 'shop':
      case 'skins':
      case 'help':
        this.goBack();
        break;
      case 'over':
        this.setScreen('title');
        break;
      default:
        break;
    }
  }

  // Rendering.

  private tick = () => {
    const state = this.runner.getRunState();
    // The game also stops itself, e.g. when the window is resized.
    if (this.screen === 'play' && state === 'paused') {
      this.setScreen('pause');
    }
    // While the game runs it asks for a render after each of its frames, so
    // the layers stay in step with it; otherwise the interface draws itself.
    if (state !== 'running' ||
        performance.now() - this.lastRender > 100) {
      this.render();
    }
    requestAnimationFrame(this.tick);
  };

  render() {
    const now = performance.now();
    const deltaTime = Math.min(50, now - (this.lastRender || now));
    this.lastRender = now;
    this.time += deltaTime;
    const width = this.width;
    const running = this.runner.getRunState() === 'running';

    const travel = this.extras.groundTravel;
    const groundMove = Math.max(0, travel - this.lastTravel);
    this.lastTravel = travel;
    this.scenery.draw(
        this.sceneCtx, width, deltaTime, travel, this.runner.isNight());

    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, width, SCENE_HEIGHT);
    this.drawLighting(width);
    this.weather.update(
        deltaTime, groundMove, running ? this.runner.getSpeed() : 0);
    this.weather.draw(ctx);

    this.updateEffects(deltaTime);
    this.areas = [];
    if (this.screen !== 'title') {
      this.drawHud(ctx, width);
    }
    this.drawFloats(ctx);
    this.drawBanner(ctx, width);
    this.drawHurt(ctx, width);

    switch (this.screen) {
      case 'title':
        this.drawTitle(ctx, width);
        break;
      case 'pause':
        this.drawPause(ctx, width);
        break;
      case 'over':
        this.drawOver(ctx, width);
        break;
      case 'shop':
        this.drawShop(ctx, width);
        break;
      case 'skins':
        this.drawSkins(ctx, width);
        break;
      case 'help':
        this.drawHelp(ctx, width);
        break;
      default:
        break;
    }
  }

  private drawLighting(width: number) {
    const biome = this.scenery.currentBiome;
    // The volcano is always a little dim, so its lava glows.
    const darkness =
        Math.max(this.scenery.nightLevel, biome.id === 'volcano' ? 0.35 : 0);
    if (darkness <= 0.01) {
      this.lighting.draw(width, SCENE_HEIGHT, 0, []);
      return;
    }
    const lights: Light[] = [];
    const dino = this.extras.dinoCenter();
    lights.push({x: dino.x, y: dino.y + STRIP_TOP, radius: 75});
    lights.push({x: width * 0.22, y: 36, radius: 60});
    for (const thing of this.extras.glowingThings()) {
      lights.push({
        x: thing.x,
        y: thing.y + STRIP_TOP,
        radius: thing.kind === 'coin' ? 18 : 26,
        color: thing.kind === 'coin' ? '#ffd23f' :
                                       POWER_UP_COLORS[thing.kind].light,
      });
    }
    for (const obstacle of this.runner.getObstacles()) {
      const light = obstacleLight(obstacle);
      if (light) {
        lights.push({...light, y: light.y + STRIP_TOP});
      }
    }
    lights.push(...this.scenery.lights());
    this.lighting.draw(width, SCENE_HEIGHT, darkness, lights);
  }

  private updateEffects(deltaTime: number) {
    const fade = (value: number, ms: number) =>
        Math.max(0, value - deltaTime / ms);
    this.coinBump = fade(this.coinBump, 200);
    this.heartShake = fade(this.heartShake, 350);
    this.heartFlash = fade(this.heartFlash, 500);
    this.hurtFlash = fade(this.hurtFlash, 450);
    if (this.banner) {
      this.banner.age += deltaTime;
      if (this.banner.age > 3000) {
        this.banner = null;
      }
    }
    if (this.notice) {
      this.notice.age += deltaTime;
      if (this.notice.age > 1600) {
        this.notice = null;
      }
    }
    for (const coin of this.flying) {
      coin.age += deltaTime;
    }
    const arrived = this.flying.filter(coin => coin.age >= 450).length;
    if (arrived) {
      this.shownCoins += arrived;
      this.coinBump = 1;
      this.flying = this.flying.filter(coin => coin.age < 450);
    }
    for (const item of this.floats) {
      item.age += deltaTime;
      item.y -= deltaTime * 0.025;
    }
    this.floats = this.floats.filter(item => item.age < 1000);
  }

  /** Where the coin counter's icon sits. */
  private coinIconPosition(width: number) {
    const count = String(this.shownCoins);
    return {x: width - 12 - textWidth(this.fxCtx, count) - 14, y: 7};
  }

  private drawHud(ctx: CanvasRenderingContext2D, width: number) {
    const sprites = getSprites();
    const e = this.extras;

    // Hearts and the shield.
    const shake = this.heartShake > 0 ?
        Math.round(Math.sin(this.time / 22) * 2 * this.heartShake) :
        0;
    for (let i = 0; i < e.maxHearts; i++) {
      const sprite = i < e.hearts ? sprites.heartFull : sprites.heartEmpty;
      const pop = this.heartFlash > 0 && i === e.hearts - 1 ?
          Math.round(this.heartFlash * 2) :
          0;
      drawSprite(ctx, sprite, 8 + i * 13 + shake, 8 - pop);
    }
    if (e.hasShield) {
      drawSprite(ctx, sprites.icons.shield, 10 + e.maxHearts * 13, 7);
    }

    // Timed power-ups with the time they have left.
    e.activePowerUps().forEach((power, i) => {
      const x = 8 + i * 19;
      const y = 22;
      const blink = power.remaining < 1500 && Math.floor(this.time / 150) % 2;
      if (!blink) {
        drawSprite(ctx, sprites.icons[power.kind], x, y);
      }
      ctx.fillStyle = 'rgba(15, 14, 20, 0.6)';
      ctx.fillRect(x, y + 15, 13, 3);
      ctx.fillStyle = POWER_UP_COLORS[power.kind].light;
      ctx.fillRect(
          x + 1, y + 16, Math.ceil(11 * power.remaining / power.duration), 1);
    });

    // Score and the way to the next world.
    const cx = width / 2;
    text(ctx, pad(e.score), cx, 7, {size: 12, align: 'center'});
    const start = levelStart(e.level);
    const next = levelStart(e.level + 1);
    const done = Math.min(1, Math.max(0, (e.distancePoints - start) / (next - start)));
    text(ctx, e.biome.name, cx, 23, {align: 'center', color: UI.muted});
    ctx.fillStyle = 'rgba(15, 14, 20, 0.45)';
    ctx.fillRect(Math.round(cx - 30), 35, 60, 2);
    ctx.fillStyle = UI.accent;
    ctx.fillRect(Math.round(cx - 30), 35, Math.round(60 * done), 2);

    // Coins and the combo.
    const count = String(this.shownCoins);
    const icon = this.coinIconPosition(width);
    const bump = Math.round(this.coinBump * 2);
    drawSprite(ctx, sprites.coin[0]!, icon.x, icon.y - bump);
    text(ctx, count, width - 10, 9 - bump, {align: 'right'});
    if (e.multiplier > 1 && this.screen === 'play') {
      const label = `×${e.multiplier}`;
      text(ctx, label, width - 10, 24, {align: 'right', color: UI.accent});
      ctx.fillStyle = UI.accent;
      ctx.fillRect(
          Math.round(width - 10 - 20 * e.comboTimeLeft), 34,
          Math.round(20 * e.comboTimeLeft), 1);
    }

    // Coins on their way to the counter.
    for (const coin of this.flying) {
      const t = easeOut(coin.age / 450);
      const x = coin.x + (icon.x + 6 - coin.x) * t;
      const y = coin.y + (icon.y + 6 - coin.y) * t - Math.sin(t * Math.PI) * 24;
      drawSprite(ctx, sprites.coin[0]!, x - 7, y - 7);
    }
  }

  private drawFloats(ctx: CanvasRenderingContext2D) {
    for (const item of this.floats) {
      text(ctx, item.text, item.x, item.y, {
        align: 'center',
        color: item.color,
        alpha: Math.min(1, (1000 - item.age) / 300),
      });
    }
  }

  /** "Level 2 — Canyon", fading in when a new world begins. */
  private drawBanner(ctx: CanvasRenderingContext2D, width: number) {
    if (!this.banner) {
      return;
    }
    const {age, level, name} = this.banner;
    const alpha = Math.min(1, age / 400, (3000 - age) / 600);
    const y = 74 + Math.round((1 - easeOut(age / 500)) * -6);
    const cx = width / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    text(ctx, `Уровень ${level + 1}`, cx, y, {align: 'center', color: UI.muted});
    text(ctx, name, cx, y + 14, {size: 16, align: 'center'});
    const half = textWidth(ctx, name, 16) / 2;
    ctx.fillStyle = UI.accent;
    ctx.fillRect(Math.round(cx - half - 44), y + 21, 32, 1);
    ctx.fillRect(Math.round(cx + half + 12), y + 21, 32, 1);
    ctx.restore();
  }

  private drawHurt(ctx: CanvasRenderingContext2D, width: number) {
    if (this.hurtFlash <= 0) {
      return;
    }
    const glow = ctx.createRadialGradient(
        width / 2, SCENE_HEIGHT / 2, SCENE_HEIGHT * 0.35, width / 2,
        SCENE_HEIGHT / 2, width * 0.6);
    glow.addColorStop(0, 'rgba(229, 72, 77, 0)');
    glow.addColorStop(1, `rgba(229, 72, 77, ${0.45 * this.hurtFlash})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, SCENE_HEIGHT);
  }

  private dim(ctx: CanvasRenderingContext2D, width: number, alpha: number) {
    ctx.fillStyle = `rgba(10, 10, 16, ${alpha})`;
    ctx.fillRect(0, 0, width, SCENE_HEIGHT);
  }

  /** Fade-in progress of the current screen. */
  private appear(delay = 0): number {
    return easeOut((this.time - this.screenAt - delay) / 250);
  }

  private drawTitle(ctx: CanvasRenderingContext2D, width: number) {
    const shade = ctx.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
    shade.addColorStop(0, 'rgba(10, 10, 16, 0.35)');
    shade.addColorStop(0.5, 'rgba(10, 10, 16, 0.1)');
    shade.addColorStop(1, 'rgba(10, 10, 16, 0.45)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, SCENE_HEIGHT);
    const cx = width / 2;

    // Title with gently bobbing letters.
    const title = 'ДИНО-ЗАБЕГ';
    const size = width < 420 ? 16 : 20;
    let x = cx - textWidth(ctx, title, size) / 2;
    [...title].forEach((char, i) => {
      const bob = Math.round(Math.sin(this.time / 450 + i * 0.6) * 2);
      text(ctx, char, x, 22 + bob, {size, color: char === '-' ? UI.accent : UI.text});
      x += textWidth(ctx, char, size);
    });
    text(ctx, 'пиксельный забег по пяти мирам', cx, 52,
         {align: 'center', color: UI.muted});

    const items: Array<[string, () => void]> = [
      ['Играть', () => this.startRun()],
      ['Улучшения', () => this.open('shop')],
      ['Скины', () => this.open('skins')],
      ['Как играть', () => this.open('help')],
    ];
    if (this.options.canFullscreen) {
      items.push(['Во весь экран', () => this.options.toggleFullscreen()]);
    }
    const menuWidth = 150;
    const top = 74;
    panel(ctx, cx - menuWidth / 2 - 6, top - 6, menuWidth + 12,
          items.length * 16 + 10, 0.9);
    items.forEach(([label, action], index) => {
      button(ctx, this.areas, label, {
        x: cx - menuWidth / 2,
        y: top + index * 16,
        width: menuWidth,
        selected: this.selected === index,
        index,
        action,
        time: this.time,
      });
    });

    // Coins and best score at the bottom.
    const best = readNumber(this.options.highScoreKey) * SCORE_COEFFICIENT;
    ctx.fillStyle = 'rgba(10, 10, 16, 0.55)';
    ctx.fillRect(0, SCENE_HEIGHT - 40, width, 40);
    const info = `${getCoinBank()}     Рекорд ${pad(best)}`;
    const infoX = cx - textWidth(ctx, info) / 2;
    drawSprite(ctx, getSprites().coin[0]!, infoX - 18, SCENE_HEIGHT - 20);
    text(ctx, info, infoX, SCENE_HEIGHT - 17);
    const hint = this.options.touch ? 'Касание — прыжок' :
                                      'Пробел — прыжок · Esc — пауза';
    text(ctx, hint, cx, SCENE_HEIGHT - 33, {align: 'center', color: UI.muted});
  }

  private drawPause(ctx: CanvasRenderingContext2D, width: number) {
    const t = this.appear();
    this.dim(ctx, width, 0.5 * t);
    const w = 170;
    const h = 92;
    const x = width / 2 - w / 2;
    const y = SCENE_HEIGHT / 2 - h / 2 + (1 - t) * 8;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x, y, w, h);
    text(ctx, 'Пауза', width / 2, y + 10, {size: 12, align: 'center'});
    const items: Array<[string, () => void]> = [
      ['Продолжить', () => this.resume()],
      ['Заново', () => this.startRun()],
      ['В меню', () => this.setScreen('title')],
    ];
    items.forEach(([label, action], index) => {
      button(ctx, this.areas, label, {
        x: x + 10, y: y + 32 + index * 17, width: w - 20,
        selected: this.selected === index, index, action, time: this.time,
      });
    });
    ctx.restore();
  }

  private drawOver(ctx: CanvasRenderingContext2D, width: number) {
    const since = this.time - this.screenAt;
    // The dino is dizzy for a moment.
    const dino = this.extras.dinoCenter();
    const stars = getSprites().icons.star;
    for (let i = 0; i < 3; i++) {
      const angle = since / 220 + i * Math.PI * 2 / 3;
      drawSprite(ctx, stars, dino.x + Math.cos(angle) * 14 - 5,
                 dino.y + STRIP_TOP - 30 + Math.sin(angle) * 4 - 5);
    }
    if (since < DEATH_MS || !this.result) {
      return;
    }
    const t = easeOut((since - DEATH_MS) / 300);
    this.dim(ctx, width, 0.55 * t);
    const r = this.result;
    const w = Math.min(300, width - 24);
    const h = 142;
    const x = width / 2 - w / 2;
    const y = SCENE_HEIGHT / 2 - h / 2 + (1 - t) * 10;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x, y, w, h);
    text(ctx, 'Забег окончен', width / 2, y + 10, {size: 12, align: 'center'});

    // Numbers count up.
    const count = easeOut((since - DEATH_MS - 200) / 800);
    const rows: Array<[string, string, string?]> = [
      ['Счёт', pad(r.score * count)],
      ['Монеты', `+${Math.round(r.coins * count)}`],
      ['Мир', `${r.biome.name}, ур. ${r.level + 1}`],
      ['Рекорд', pad(r.best), r.record ? UI.accent : undefined],
    ];
    rows.forEach(([label, value, color], i) => {
      const ry = y + 34 + i * 15;
      text(ctx, label, x + 14, ry, {color: UI.muted});
      text(ctx, value, x + w - 14, ry, {align: 'right', color: color ?? UI.text});
    });
    if (r.record && count >= 1) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time / 200);
      text(ctx, 'Новый рекорд!', width / 2, y + 96, {
        align: 'center', color: UI.accent, alpha: pulse,
      });
    }
    const items: Array<[string, () => void]> = [
      ['Ещё раз', () => this.startRun()],
      ['Улучшения', () => this.open('shop')],
      ['Меню', () => this.setScreen('title')],
    ];
    const bw = (w - 20) / 3;
    items.forEach(([label, action], index) => {
      button(ctx, this.areas, label, {
        x: x + 10 + index * bw, y: y + h - 26, width: bw,
        selected: this.selected === index, index, action, time: this.time,
      });
    });
    ctx.restore();
  }

  private coinsLine(
      ctx: CanvasRenderingContext2D, value: string, right: number, y: number,
      color: string = UI.text) {
    const w = textWidth(ctx, value);
    drawSprite(ctx, getSprites().coin[0]!, right - w - 17, y - 3);
    text(ctx, value, right, y, {align: 'right', color});
  }

  private drawShop(ctx: CanvasRenderingContext2D, width: number) {
    const t = this.appear();
    this.dim(ctx, width, 0.55 * t);
    const w = Math.min(440, width - 16);
    const h = 222;
    const x = width / 2 - w / 2;
    const y = SCENE_HEIGHT / 2 - h / 2 + (1 - t) * 8;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x, y, w, h);
    text(ctx, 'Улучшения', x + 12, y + 10, {size: 12});
    this.coinsLine(ctx, String(getCoinBank()), x + w - 12, y + 12);

    UPGRADES.forEach((upgrade, index) => {
      const ry = y + 32 + index * 32;
      const selected = this.selected === index;
      const level = upgradeLevel(upgrade.id);
      const price = nextPrice(upgrade);
      const affordable = price !== null && getCoinBank() >= price;
      this.areas.push({
        x: x + 6, y: ry - 2, width: w - 12, height: 30, index,
        action: () => this.buy(upgrade.id),
      });
      if (selected) {
        ctx.fillStyle = UI.select;
        ctx.fillRect(Math.round(x + 6), Math.round(ry - 2), Math.round(w - 12), 30);
        ctx.fillStyle = UI.accent;
        ctx.fillRect(Math.round(x + 6), Math.round(ry - 2), 1, 30);
      }
      text(ctx, upgrade.name, x + 16, ry + 1,
           {color: selected ? UI.accent : UI.text});
      const description = wrap(ctx, upgrade.describe(Math.min(level + 1,
          maxLevel(upgrade))), w - 130)[0] ?? '';
      text(ctx, description, x + 16, ry + 15, {color: UI.muted, shadow: false});
      // Level pips.
      for (let i = 0; i < maxLevel(upgrade); i++) {
        ctx.fillStyle = i < level ? UI.accent : UI.panelLine;
        ctx.fillRect(Math.round(x + w - 100 + i * 8), ry + 3, 6, 6);
      }
      if (price === null) {
        text(ctx, 'МАКС', x + w - 16, ry + 15, {align: 'right', color: UI.good});
      } else {
        this.coinsLine(ctx, String(price), x + w - 16, ry + 15,
                       affordable ? UI.text : UI.danger);
      }
    });

    const backIndex = UPGRADES.length;
    button(ctx, this.areas, 'Назад', {
      x: x + w / 2 - 50, y: y + h - 22, width: 100,
      selected: this.selected === backIndex, index: backIndex,
      action: () => this.goBack(), time: this.time,
    });
    this.drawNotice(ctx, width, y + 12);
    ctx.restore();
  }

  private buy(id: (typeof UPGRADES)[number]['id']) {
    const upgrade = UPGRADES.find(u => u.id === id)!;
    if (nextPrice(upgrade) === null) {
      this.sfx.deny();
      this.notice = {text: 'Уже максимум', age: 0};
    } else if (buyUpgrade(upgrade)) {
      this.sfx.confirm();
      this.notice = {text: 'Куплено!', age: 0};
    } else {
      this.sfx.deny();
      this.notice = {text: 'Не хватает монет', age: 0};
    }
  }

  private drawNotice(ctx: CanvasRenderingContext2D, width: number, y: number) {
    if (!this.notice) {
      return;
    }
    const alpha = Math.min(1, (1600 - this.notice.age) / 300);
    text(ctx, this.notice.text, width / 2, y,
         {align: 'center', color: UI.accent, alpha});
  }

  private preview(skin: Skin): HTMLCanvasElement {
    let canvas = this.previews.get(skin.id);
    if (!canvas) {
      canvas = dinoPreview(this.options.sheet, this.options.scale, skin);
      this.previews.set(skin.id, canvas);
    }
    return canvas;
  }

  private drawSkins(ctx: CanvasRenderingContext2D, width: number) {
    const t = this.appear();
    this.dim(ctx, width, 0.55 * t);
    const w = Math.min(420, width - 16);
    const h = 222;
    const x = width / 2 - w / 2;
    const y = SCENE_HEIGHT / 2 - h / 2 + (1 - t) * 8;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x, y, w, h);
    text(ctx, 'Скины', x + 12, y + 10, {size: 12});
    this.coinsLine(ctx, String(getCoinBank()), x + w - 12, y + 12);

    const current = getSkin();
    const cardW = (w - 24) / 3;
    const cardH = 82;
    SKINS.forEach((skin, index) => {
      const cx = x + 12 + (index % 3) * cardW;
      const cy = y + 30 + Math.floor(index / 3) * (cardH + 2);
      const selected = this.selected === index;
      const owned = isOwned(skin);
      if (selected) {
        ctx.fillStyle = UI.select;
        ctx.fillRect(Math.round(cx + 2), Math.round(cy), Math.round(cardW - 4), cardH);
        ctx.fillStyle = UI.accent;
        ctx.fillRect(Math.round(cx + 2), Math.round(cy), Math.round(cardW - 4), 1);
      }
      ctx.save();
      ctx.globalAlpha *= owned ? 1 : 0.45;
      const bob = selected ? Math.round(Math.sin(this.time / 200) * 1.5) : 0;
      ctx.drawImage(this.preview(skin), Math.round(cx + cardW / 2 - 22),
                    Math.round(cy + 6 + bob), 44, 47);
      ctx.restore();
      text(ctx, skin.name, cx + cardW / 2, cy + 56,
           {align: 'center', color: selected ? UI.accent : UI.text});
      if (current?.id === skin.id) {
        text(ctx, 'выбран', cx + cardW / 2, cy + 68,
             {align: 'center', color: UI.good, shadow: false});
      } else if (owned) {
        text(ctx, 'есть', cx + cardW / 2, cy + 68,
             {align: 'center', color: UI.muted, shadow: false});
      } else {
        const label = String(skin.price);
        const lw = textWidth(ctx, label);
        this.coinsLine(ctx, label, cx + cardW / 2 + lw / 2 + 8, cy + 68,
                       getCoinBank() >= skin.price ? UI.text : UI.danger);
      }
      this.areas.push({
        x: cx, y: cy, width: cardW, height: cardH, index,
        action: () => this.chooseSkin(skin),
      });
    });

    const backIndex = SKINS.length;
    button(ctx, this.areas, 'Назад', {
      x: x + w / 2 - 50, y: y + h - 22, width: 100,
      selected: this.selected === backIndex, index: backIndex,
      action: () => this.goBack(), time: this.time,
    });
    this.drawNotice(ctx, width, y + 12);
    ctx.restore();
  }

  private async chooseSkin(skin: Skin) {
    if (!isOwned(skin)) {
      if (!buySkin(skin)) {
        this.sfx.deny();
        this.notice = {text: 'Не хватает монет', age: 0};
        return;
      }
      this.notice = {text: 'Куплено!', age: 0};
    }
    this.sfx.confirm();
    saveSelectedSkin(skin);
    await setSkin(skin);
  }

  private drawHelp(ctx: CanvasRenderingContext2D, width: number) {
    const t = this.appear();
    this.dim(ctx, width, 0.55 * t);
    const w = Math.min(440, width - 16);
    const h = 222;
    const x = width / 2 - w / 2;
    const y = SCENE_HEIGHT / 2 - h / 2 + (1 - t) * 8;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x, y, w, h);
    text(ctx, 'Как играть', x + 12, y + 10, {size: 12});

    const lines = this.options.touch ?
        ['Касание — прыжок, чем дольше, тем выше'] :
        ['Пробел или ↑ — прыжок, ↓ — пригнуться', 'Esc — пауза, F — во весь экран'];
    lines.push(
        'Удар снимает сердце. Без сердец забег окончен.',
        'Монеты подряд дают множитель до ×5.');
    let ly = y + 30;
    for (const line of lines) {
      for (const part of wrap(ctx, line, w - 28)) {
        text(ctx, part, x + 14, ly, {color: UI.muted, shadow: false});
        ly += 12;
      }
    }
    ly += 6;
    const icons = getSprites().icons;
    const columnW = (w - 28) / 2;
    POWER_UP_HELP.forEach(([kind, help], i) => {
      const cx = x + 14 + (i % 2) * columnW;
      const cy = ly + Math.floor(i / 2) * 26;
      drawSprite(ctx, icons[kind], cx, cy);
      text(ctx, POWER_UP_NAMES[kind], cx + 18, cy, {color: UI.text});
      text(ctx, help, cx + 18, cy + 11, {color: UI.muted, shadow: false});
    });

    button(ctx, this.areas, 'Назад', {
      x: x + w / 2 - 50, y: y + h - 22, width: 100,
      selected: this.selected === 0, index: 0,
      action: () => this.goBack(), time: this.time,
    });
    ctx.restore();
  }
}
