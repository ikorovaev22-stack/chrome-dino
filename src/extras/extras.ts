/**
 * Extended game: coins, power-ups, weather and the on-screen counters.
 * The Runner calls into this class at a few points of its game loop (search
 * for "chrome-dino extras" in dino_game/).
 */

import {FPS, IS_HIDPI} from '../dino_game/constants.js';
import type {Dimensions} from '../dino_game/dimensions.js';
import type {Horizon} from '../dino_game/horizon.js';
import type {Obstacle} from '../dino_game/obstacle.js';
import type {SpritePosition} from '../dino_game/sprite_position.js';
import type {Trex} from '../dino_game/trex.js';
import {getRandomNum} from '../dino_game/utils.js';

import type {PowerUpKind} from './art.js';
import {getSprites} from './art.js';
import {drawSprite} from './pixel_art.js';
import {Sfx} from './sfx.js';
import {Weather} from './weather.js';

const COIN_POINTS = 10;
const SMASH_POINTS = 25;
/** Score units per game pixel, as DistanceMeter's COEFFICIENT. */
const SCORE_COEFFICIENT = 0.025;

/** How long each power-up lasts, in ms. The shield lasts until a hit. */
const DURATION: Record<PowerUpKind, number> = {
  shield: Infinity,
  doubleJump: 10000,
  magnet: 10000,
  star: 6000,
  slowMotion: 6000,
};
const POWER_UP_WEIGHTS: Array<[PowerUpKind, number]> = [
  ['shield', 3],
  ['doubleJump', 2],
  ['magnet', 2],
  ['star', 1.5],
  ['slowMotion', 2],
];
const SLOW_MOTION_TIME_SCALE = 0.6;
const INVULNERABLE_AFTER_SHIELD_MS = 1000;
const MAGNET_RANGE = 230;
/** Power-ups warn this long before running out by blinking. */
const EXPIRY_WARNING_MS = 1500;

const COIN_SIZE = {width: 14, height: 14};
const ITEM_SIZE = 17;
/** Coin heights: picked up while running, or needing a jump. */
const GROUND_ROW_Y = 116;
const AIR_ROW_Y = 60;

interface Coin {
  x: number;
  y: number;
  attracted: boolean;
}

interface Item {
  x: number;
  y: number;
  kind: PowerUpKind;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  gravity: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
      a.y + a.height > b.y;
}

function pickPowerUp(): PowerUpKind {
  const total = POWER_UP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [kind, weight] of POWER_UP_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) {
      return kind;
    }
  }
  return 'shield';
}

export interface ExtrasOptions {
  canvas: HTMLCanvasElement;
  dimensions: Dimensions;
  tRex: Trex;
  horizon: Horizon;
  imageSprite: HTMLImageElement;
  textSpritePos: SpritePosition;
}

export class Extras {
  private ctx: CanvasRenderingContext2D;
  private dimensions: Dimensions;
  private tRex: Trex;
  private horizon: Horizon;
  private imageSprite: HTMLImageElement;
  private textSpritePos: SpritePosition;
  private sfx = new Sfx();
  private weather: Weather;

  private time: number = 0;
  private coins: Coin[] = [];
  private items: Item[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private active = new Map<PowerUpKind, number>();
  private invulnerableMs: number = 0;
  private doubleJumpUsed: boolean = false;
  private coinCount: number = 0;
  private bonusPoints: number = 0;
  // Ground distance until the next coin pattern, in pixels.
  private untilCoins: number = 0;
  private nextPattern: 'arc'|'row'|null = null;
  // Time until the next power-up, in ms.
  private untilPowerUp: number = 0;
  private seenObstacles = new WeakSet<Obstacle>();

  constructor(options: ExtrasOptions) {
    this.ctx = options.canvas.getContext('2d')!;
    this.dimensions = options.dimensions;
    this.tRex = options.tRex;
    this.horizon = options.horizon;
    this.imageSprite = options.imageSprite;
    this.textSpritePos = options.textSpritePos;
    this.weather =
        new Weather(() => this.dimensions.width, this.dimensions.height);
    this.reset();
  }

  /** Bonus points converted to game pixels, to add to the distance ran. */
  get bonusDistance(): number {
    return this.bonusPoints / SCORE_COEFFICIENT;
  }

  /** Multiplier for the game's frame time (slow motion power-up). */
  get timeScale(): number {
    return this.active.has('slowMotion') ? SLOW_MOTION_TIME_SCALE : 1;
  }

  reset() {
    this.time = 0;
    this.coins = [];
    this.items = [];
    this.particles = [];
    this.popups = [];
    this.active.clear();
    this.invulnerableMs = 0;
    this.doubleJumpUsed = false;
    this.coinCount = 0;
    this.bonusPoints = 0;
    this.untilCoins = getRandomNum(300, 700);
    this.nextPattern = null;
    this.untilPowerUp = getRandomNum(7000, 11000);
    this.seenObstacles = new WeakSet();
    this.weather.reset();
  }

  /**
   * Moves and draws the coins, power-ups and particles (behind the dino).
   * @param spawn Whether new coins and power-ups may appear.
   */
  update(deltaTime: number, speed: number, spawn: boolean) {
    this.time += deltaTime;
    // Same step as the obstacles, so coins hanging over a cactus stay there.
    const groundMove = Math.floor(speed * FPS / 1000 * deltaTime);

    this.weather.update(deltaTime, groundMove, speed);
    this.updatePowerUpTimers(deltaTime);
    if (spawn) {
      this.spawnCoins(groundMove);
      this.spawnPowerUp(deltaTime);
    }
    this.updateCoins(deltaTime, groundMove);
    this.updateItems(groundMove);
    this.updateParticles(deltaTime);
    if (!this.tRex.jumping) {
      this.doubleJumpUsed = false;
    }

    this.drawCoins();
    this.drawItems();
    this.drawParticles();
  }

  /** Draws everything in front of the dino: effects, weather and counters. */
  drawOverlay() {
    this.drawDinoEffects();
    this.drawPopups();
    this.weather.draw(this.ctx);
    this.drawHud();
  }

  /** Opacity for drawing the dino; it flickers while it can't be hurt. */
  trexAlpha(): number {
    const flicker = this.active.has('star') || this.invulnerableMs > 0;
    return flicker && Math.floor(this.time / 80) % 2 ? 0.35 : 1;
  }

  /**
   * Called on a collision. Returns true when a power-up absorbs it; the
   * obstacle is then smashed and should be removed.
   */
  absorbCollision(obstacle: Obstacle): boolean {
    if (this.active.has('star') || this.invulnerableMs > 0) {
      this.smash(obstacle, this.active.has('star'));
      return true;
    }
    if (this.active.has('shield')) {
      this.active.delete('shield');
      this.invulnerableMs = INVULNERABLE_AFTER_SHIELD_MS;
      this.smash(obstacle, false);
      return true;
    }
    return false;
  }

  /** Whether a mid-air jump is allowed now; uses it up if so. */
  tryDoubleJump(): boolean {
    if (!this.active.has('doubleJump') || this.doubleJumpUsed) {
      return false;
    }
    this.doubleJumpUsed = true;
    this.sfx.doubleJump();
    const {x, y} = this.dinoCenter();
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x - 6 + Math.random() * 12,
        y: y + 20,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 1.5,
        age: 0,
        life: 350,
        size: 2,
        gravity: 0,
        color: '#bababa',
      });
    }
    return true;
  }

  private addPoints(points: number) {
    this.bonusPoints += points;
  }

  private smash(obstacle: Obstacle, withBonus: boolean) {
    this.sfx.smash();
    const cx = obstacle.xPos + obstacle.width / 2;
    const cy = obstacle.yPos + obstacle.typeConfig.height / 2;
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * obstacle.width,
        y: cy + (Math.random() - 0.5) * obstacle.typeConfig.height,
        vx: 1 + Math.random() * 4,
        vy: -2 - Math.random() * 4,
        age: 0,
        life: 700,
        size: 2 + Math.floor(Math.random() * 2),
        gravity: 0.35,
        color: '#535353',
      });
    }
    if (withBonus) {
      this.addPoints(SMASH_POINTS);
      this.popups.push(
          {x: cx - 15, y: obstacle.yPos - 16, text: `+${SMASH_POINTS}`, age: 0});
    }
  }

  private dinoBox(): Box {
    const t = this.tRex;
    return t.ducking ? {x: t.xPos + 2, y: t.yPos + 18, width: 55, height: 25} :
                       {x: t.xPos + 2, y: t.yPos + 2, width: 40, height: 43};
  }

  private dinoCenter(): {x: number, y: number} {
    const box = this.dinoBox();
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  }

  /**
   * Free stretch of track entering from the right, before the next obstacle
   * can appear. Returns where it starts and how long it is.
   */
  private freeTrackAhead(): {start: number, length: number} {
    const last = this.horizon.obstacles.at(-1);
    const right = this.dimensions.width;
    if (!last) {
      return {start: right, length: 0};
    }
    // Pterodactyls and tumbleweeds drift relative to the ground; keep clear.
    const drifts = last.typeConfig.type === 'pterodactyl' ||
        last.typeConfig.type === 'obstacle2';
    const lastEnd = last.xPos + last.width;
    const start = Math.max(right + 4, lastEnd + (drifts ? 70 : 25));
    const end = lastEnd + last.gap - 25;
    return {start, length: end - start};
  }

  private spawnCoins(groundMove: number) {
    this.untilCoins -= groundMove;
    if (this.untilCoins > 0) {
      // Obstacles passing meanwhile don't get an arc.
      this.horizon.obstacles.forEach(o => this.seenObstacles.add(o));
      return;
    }
    if (!this.nextPattern) {
      this.nextPattern = Math.random() < 0.45 ? 'arc' : 'row';
    }

    // An arc of coins over the next cactus or rock.
    for (const obstacle of this.horizon.obstacles) {
      if (this.seenObstacles.has(obstacle)) {
        continue;
      }
      this.seenObstacles.add(obstacle);
      const type = obstacle.typeConfig.type;
      const grounded = type === 'cactusSmall' || type === 'cactusLarge' ||
          type === 'obstacle';
      if (this.nextPattern === 'arc' && !grounded) {
        this.nextPattern = 'row';
      } else if (this.nextPattern === 'arc') {
        const center = obstacle.xPos + obstacle.width / 2;
        const spread = Math.max(44, obstacle.width / 2 + 28);
        for (let i = -2; i <= 2; i++) {
          const t = i / 2;
          this.coins.push({
            x: center + t * spread - COIN_SIZE.width / 2,
            y: obstacle.yPos - 22 - (1 - t * t) * 22,
            attracted: false,
          });
        }
        this.patternPlaced();
        return;
      }
    }
    if (this.nextPattern !== 'row') {
      return;
    }

    // A row or a wave of coins on a free stretch of track.
    const {start, length} = this.freeTrackAhead();
    const shape = getRandomNum(0, 2);
    const count = shape === 2 ? 6 : getRandomNum(3, 5);
    const spacing = shape === 2 ? 18 : 20;
    if (length < count * spacing) {
      return;
    }
    for (let i = 0; i < count; i++) {
      let y = shape === 0 ? GROUND_ROW_Y : AIR_ROW_Y;
      if (shape === 2) {
        y = 104 - Math.sin(i / (count - 1) * Math.PI) * 46;
      }
      this.coins.push({x: start + i * spacing, y, attracted: false});
    }
    this.patternPlaced();
  }

  private patternPlaced() {
    this.nextPattern = null;
    this.untilCoins = getRandomNum(350, 800);
  }

  private spawnPowerUp(deltaTime: number) {
    this.untilPowerUp -= deltaTime;
    if (this.untilPowerUp > 0 || this.items.length) {
      return;
    }
    const {start, length} = this.freeTrackAhead();
    if (length < ITEM_SIZE + 20) {
      return;
    }
    this.items.push({
      x: start + 10,
      y: Math.random() < 0.5 ? 100 : 64,
      kind: pickPowerUp(),
    });
    this.untilPowerUp = getRandomNum(12000, 20000);
  }

  private updatePowerUpTimers(deltaTime: number) {
    for (const [kind, remaining] of this.active) {
      if (remaining === Infinity) {
        continue;
      }
      if (remaining - deltaTime <= 0) {
        this.active.delete(kind);
        this.sfx.powerDown();
      } else {
        this.active.set(kind, remaining - deltaTime);
      }
    }
    this.invulnerableMs = Math.max(0, this.invulnerableMs - deltaTime);
  }

  private updateCoins(deltaTime: number, groundMove: number) {
    const dino = this.dinoBox();
    const center = this.dinoCenter();
    const frames = deltaTime / (1000 / FPS);
    const magnet = this.active.has('magnet');

    this.coins = this.coins.filter(coin => {
      if (magnet && !coin.attracted && coin.x < center.x + MAGNET_RANGE &&
          coin.x > center.x - 30) {
        coin.attracted = true;
      }
      if (coin.attracted) {
        const dx = center.x - COIN_SIZE.width / 2 - coin.x;
        const dy = center.y - COIN_SIZE.height / 2 - coin.y;
        const distance = Math.hypot(dx, dy);
        const step = Math.min(distance, Math.max(9, distance * 0.25) * frames);
        if (distance > 0) {
          coin.x += dx / distance * step;
          coin.y += dy / distance * step;
        }
      } else {
        coin.x -= groundMove;
      }

      if (overlaps(dino, {x: coin.x, y: coin.y, ...COIN_SIZE})) {
        this.coinCount++;
        this.addPoints(COIN_POINTS);
        this.sfx.coin();
        this.sparkle(coin.x + COIN_SIZE.width / 2, coin.y + COIN_SIZE.height / 2);
        return false;
      }
      return coin.x > -COIN_SIZE.width;
    });
  }

  private updateItems(groundMove: number) {
    const dino = this.dinoBox();
    this.items = this.items.filter(item => {
      item.x -= groundMove;
      if (overlaps(
              dino,
              {x: item.x, y: item.y, width: ITEM_SIZE, height: ITEM_SIZE})) {
        this.activate(item.kind);
        return false;
      }
      return item.x > -ITEM_SIZE;
    });
  }

  private activate(kind: PowerUpKind) {
    this.active.set(kind, DURATION[kind]);
    this.sfx.powerUp();
    const {x, y} = this.dinoCenter();
    this.sparkle(x, y - 10);
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 1.6,
        vy: Math.sin(angle) * 1.6,
        age: 0,
        life: 250,
        size: 2,
        gravity: 0,
        color: '#bababa',
      });
    }
  }

  private updateParticles(deltaTime: number) {
    const frames = deltaTime / (1000 / FPS);
    this.particles = this.particles.filter(p => {
      p.age += deltaTime;
      p.x += p.vx * frames;
      p.y += p.vy * frames;
      p.vy += p.gravity * frames;
      return p.age < p.life;
    });
    this.popups = this.popups.filter(popup => {
      popup.age += deltaTime;
      popup.y -= 0.4 * frames;
      return popup.age < 800;
    });
  }

  private drawCoins() {
    const frames = getSprites().coin;
    // Spin cycle: face, turning, edge, turning back.
    const cycle = [0, 1, 2, 3, 2, 1];
    const frame = cycle[Math.floor(this.time / 90) % cycle.length]!;
    const sprite = frames[frame]!;
    for (const coin of this.coins) {
      const offset = (COIN_SIZE.width - sprite.width) / 2;
      drawSprite(this.ctx, sprite, coin.x + offset, coin.y);
    }
  }

  private drawItems() {
    const sprites = getSprites();
    for (const item of this.items) {
      const bob = Math.round(Math.sin(this.time / 220) * 2);
      drawSprite(this.ctx, sprites.box, item.x, item.y + bob);
      drawSprite(this.ctx, sprites.icons[item.kind], item.x + 3, item.y + 3 + bob);
    }
  }

  private drawParticles() {
    this.ctx.save();
    for (const p of this.particles) {
      this.ctx.globalAlpha = 1 - p.age / p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    this.ctx.restore();
  }

  private drawDinoEffects() {
    const {x, y} = this.dinoCenter();
    this.ctx.save();
    this.ctx.fillStyle = '#535353';
    if (this.active.has('shield')) {
      // Rotating dotted bubble.
      const dots = 20;
      for (let i = 0; i < dots; i++) {
        const angle = i / dots * Math.PI * 2 + this.time / 900;
        this.ctx.fillRect(
            Math.round(x + Math.cos(angle) * 31) - 1,
            Math.round(y + Math.sin(angle) * 29) - 1, 2, 2);
      }
    }
    if (this.active.has('star')) {
      // Twinkling stars around the dino.
      const sprite = getSprites().icons.star;
      this.ctx.globalAlpha = 0.6;
      for (let i = 0; i < 3; i++) {
        const angle = i / 3 * Math.PI * 2 + this.time / 300;
        drawSprite(
            this.ctx, sprite, x + Math.cos(angle) * 34 - 5,
            y + Math.sin(angle) * 30 - 5);
      }
    }
    this.ctx.restore();
  }

  private drawPopups() {
    this.ctx.save();
    for (const popup of this.popups) {
      this.ctx.globalAlpha = 1 - popup.age / 800;
      this.drawText(popup.text, popup.x, popup.y);
    }
    this.ctx.restore();
  }

  private drawHud() {
    const sprites = getSprites();
    // Coins collected this run, opposite the distance meter.
    drawSprite(this.ctx, sprites.coin[0]!, 3, 4);
    this.drawText(String(this.coinCount), 20, 5);

    // Active power-ups, with the time they have left.
    let x = 4;
    for (const [kind, remaining] of this.active) {
      const blinking = remaining < EXPIRY_WARNING_MS &&
          Math.floor(this.time / 150) % 2 === 0;
      if (!blinking) {
        drawSprite(this.ctx, sprites.icons[kind], x, 23);
      }
      if (remaining !== Infinity) {
        const fraction = Math.min(1, remaining / DURATION[kind]);
        this.ctx.fillStyle = '#535353';
        this.ctx.fillRect(x + 14, 30, Math.ceil(22 * fraction), 3);
        this.ctx.fillStyle = '#dadada';
        this.ctx.fillRect(
            x + 14 + Math.ceil(22 * fraction), 30,
            22 - Math.ceil(22 * fraction), 3);
      }
      x += remaining === Infinity ? 16 : 42;
    }
  }

  /** Draws digits and '+' in the score font of the sprite sheet. */
  private drawText(text: string, x: number, y: number) {
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      const targetX = Math.round(x + i * 11);
      if (char === '+') {
        drawSprite(this.ctx, getSprites().plus, targetX, Math.round(y));
        continue;
      }
      const scale = IS_HIDPI ? 2 : 1;
      this.ctx.drawImage(
          this.imageSprite, this.textSpritePos.x + 10 * Number(char) * scale,
          this.textSpritePos.y, 10 * scale, 13 * scale, targetX, Math.round(y),
          10, 13);
    }
  }
}
