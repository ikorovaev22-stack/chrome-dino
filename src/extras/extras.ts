/**
 * Game logic of the extended game: hearts, coins and combos, power-ups,
 * worlds and levels, and the effects drawn in the game's own canvas. The
 * Runner calls into this class at a few points of its game loop (search for
 * "chrome-dino extras" in dino_game/); the page's interface reads its state
 * and listens to its events.
 */

import {FPS} from '../dino_game/constants.js';
import type {Dimensions} from '../dino_game/dimensions.js';
import type {Horizon} from '../dino_game/horizon.js';
import type {Obstacle} from '../dino_game/obstacle.js';
import type {Trex} from '../dino_game/trex.js';
import {getRandomNum} from '../dino_game/utils.js';

import type {PowerUpKind} from './art.js';
import {getSprites, POWER_UP_COLORS} from './art.js';
import type {Biome} from './biomes.js';
import {biomeForLevel, levelForScore, levelStart} from './biomes.js';
import {emit} from './events.js';
import {setObstacleBiome} from './obstacles.js';
import {drawSprite} from './pixel_art.js';
import {Sfx} from './sfx.js';
import {addToCoinBank} from './skins.js';
import {onSkinChange, readySheet, sheetFor} from './theme.js';
import {upgradeLevel} from './upgrades.js';

/** A gentler speed curve than Chrome's (0.001 and 13). */
export const EXTRA_SPEED_CONFIG = {acceleration: 0.0006, maxSpeed: 11.5};

const COIN_POINTS = 10;
const SMASH_POINTS = 25;
/** Score units per game pixel, as DistanceMeter's COEFFICIENT. */
const SCORE_COEFFICIENT = 0.025;
const BASE_HEARTS = 3;
/** Coins picked up within this time of each other build a combo. */
const COMBO_WINDOW_MS = 1600;
const COINS_PER_MULTIPLIER = 3;
const MAX_MULTIPLIER = 5;
const HURT_INVULNERABLE_MS = 1600;
const SHIELD_INVULNERABLE_MS = 1000;
/** A short freeze when the dino gets hurt. */
const HIT_STOP_MS = 90;
const SLOW_MOTION_TIME_SCALE = 0.6;
const MAGNET_RANGE = 230;
const FONT = '"Press Start 2P", monospace';

const COIN_SIZE = {width: 14, height: 14};
const ITEM_SIZE = 17;
/** Coin heights: picked up while running, or needing a jump. */
const GROUND_ROW_Y = 116;
const AIR_ROW_Y = 60;

/** Squash and stretch of the dino, in ms. */
const SQUASH_MS = 170;

export type TimedKind = Exclude<PowerUpKind, 'heart'>;

const POWER_UP_WEIGHTS: Array<[TimedKind, number]> = [
  ['shield', 3],
  ['doubleJump', 2],
  ['magnet', 2.5],
  ['star', 1.5],
  ['slowMotion', 2],
];

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
  color: string;
  age: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActivePowerUp {
  kind: TimedKind;
  remaining: number;
  duration: number;
}

export type CollisionOutcome = 'smash'|'pass'|false;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
      a.y + a.height > b.y;
}

function pickPowerUp(): TimedKind {
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

function durationOf(kind: TimedKind): number {
  switch (kind) {
    case 'shield':
      return Infinity;
    case 'magnet':
      return (10 + upgradeLevel('magnet') * 4) * 1000;
    case 'star':
      return (6 + upgradeLevel('star') * 2) * 1000;
    case 'doubleJump':
      return 10000;
    case 'slowMotion':
      return 6000;
  }
}

export interface ExtrasOptions {
  canvas: HTMLCanvasElement;
  dimensions: Dimensions;
  tRex: Trex;
  horizon: Horizon;
  // Swaps the Runner's sprite sheet (coloured per world and skin).
  setImageSprite: (sprite: HTMLImageElement) => void;
}

export class Extras {
  /** Called after every frame the game draws. */
  onFrame: (() => void)|null = null;

  private ctx: CanvasRenderingContext2D;
  private dimensions: Dimensions;
  private tRex: Trex;
  private horizon: Horizon;
  private setImageSprite: (sprite: HTMLImageElement) => void;
  private sfx = new Sfx();

  private time: number = 0;
  private levelIndex: number = 0;
  private currentBiome: Biome = biomeForLevel(0);
  private coins: Coin[] = [];
  private items: Item[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private active = new Map<TimedKind, {remaining: number, duration: number}>();
  private heartCount: number = BASE_HEARTS;
  private invulnerableMs: number = 0;
  private hitStopUntil: number = 0;
  private doubleJumpUsed: boolean = false;
  private coinCount: number = 0;
  private combo: number = 0;
  private lastCoinAt: number = -Infinity;
  private bonusPoints: number = 0;
  // Score from the distance ran (decides the level).
  private runPoints: number = 0;
  private travelled: number = 0;
  // Ground distance until the next coin pattern, in pixels.
  private untilCoins: number = 0;
  private nextPattern: 'arc'|'row'|null = null;
  // Time until the next power-up, in ms.
  private untilPowerUp: number = 0;
  private seenObstacles = new WeakSet<Obstacle>();
  private wasJumping: boolean = false;
  private jumpedAt: number = -Infinity;
  private landedAt: number = -Infinity;
  private untilDust: number = 0;
  private trail: number[] = [];

  constructor(options: ExtrasOptions) {
    this.ctx = options.canvas.getContext('2d')!;
    this.dimensions = options.dimensions;
    this.tRex = options.tRex;
    this.horizon = options.horizon;
    this.setImageSprite = options.setImageSprite;
    onSkinChange(() => this.applySheet());
    this.reset();
  }

  // State for the interface.

  get hearts(): number {
    return this.heartCount;
  }

  get maxHearts(): number {
    return BASE_HEARTS + upgradeLevel('hearts');
  }

  get coinsCollected(): number {
    return this.coinCount;
  }

  /** Coin value multiplier from the current combo. */
  get multiplier(): number {
    return Math.min(
        MAX_MULTIPLIER,
        1 + Math.floor(Math.max(0, this.combo - 1) / COINS_PER_MULTIPLIER));
  }

  /** Share of the combo window left (1 right after a coin). */
  get comboTimeLeft(): number {
    if (!this.combo) {
      return 0;
    }
    return Math.max(0, 1 - (this.time - this.lastCoinAt) / COMBO_WINDOW_MS);
  }

  get score(): number {
    return this.runPoints + this.bonusPoints;
  }

  get distancePoints(): number {
    return this.runPoints;
  }

  get level(): number {
    return this.levelIndex;
  }

  get biome(): Biome {
    return this.currentBiome;
  }

  /** Pixels the ground has moved this run, exactly as the obstacles did. */
  get groundTravel(): number {
    return this.travelled;
  }

  get invulnerable(): boolean {
    return this.invulnerableMs > 0;
  }

  get hasShield(): boolean {
    return this.active.has('shield');
  }

  /** Timed power-ups in effect, for the interface. */
  activePowerUps(): ActivePowerUp[] {
    return [...this.active]
        .filter(([, state]) => state.duration !== Infinity)
        .map(([kind, state]) => ({kind, ...state}));
  }

  /** Bonus points converted to game pixels, to add to the distance ran. */
  get bonusDistance(): number {
    return this.bonusPoints / SCORE_COEFFICIENT;
  }

  /** Multiplier for the game's frame time (hit stop, slow motion). */
  get timeScale(): number {
    if (performance.now() < this.hitStopUntil) {
      return 0.05;
    }
    return this.active.has('slowMotion') ? SLOW_MOTION_TIME_SCALE : 1;
  }

  /** Coins and power-ups on the track, which glow at night. */
  glowingThings(): Array<{x: number, y: number, kind: 'coin'|PowerUpKind}> {
    return [
      ...this.coins.map(c => ({
        x: c.x + COIN_SIZE.width / 2,
        y: c.y + COIN_SIZE.height / 2,
        kind: 'coin' as const,
      })),
      ...this.items.map(i => ({
        x: i.x + ITEM_SIZE / 2,
        y: i.y + ITEM_SIZE / 2,
        kind: i.kind,
      })),
    ];
  }

  dinoCenter(): {x: number, y: number} {
    const box = this.dinoBox();
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  }

  reset() {
    this.time = 0;
    this.coins = [];
    this.items = [];
    this.particles = [];
    this.popups = [];
    this.active.clear();
    this.heartCount = this.maxHearts;
    if (upgradeLevel('shield') > 0) {
      this.active.set('shield', {remaining: Infinity, duration: Infinity});
    }
    this.invulnerableMs = 0;
    this.hitStopUntil = 0;
    this.doubleJumpUsed = false;
    this.coinCount = 0;
    this.combo = 0;
    this.lastCoinAt = -Infinity;
    this.bonusPoints = 0;
    this.runPoints = 0;
    this.travelled = 0;
    this.untilCoins = getRandomNum(300, 700);
    this.nextPattern = null;
    this.untilPowerUp = getRandomNum(6000, 9000) * this.luck();
    this.seenObstacles = new WeakSet();
    this.trail = [];
    this.jumpedAt = -Infinity;
    this.landedAt = -Infinity;
    this.levelIndex = 0;
    this.currentBiome = biomeForLevel(0);
    setObstacleBiome(this.currentBiome);
    this.applySheet();
    this.emitLevel(true);
    emit('start', null);
  }

  /** Power-ups come sooner with the luck upgrade. */
  private luck(): number {
    return 1 - upgradeLevel('luck') * 0.15;
  }

  /** Uses the sprite sheet coloured for the current world and skin. */
  private applySheet() {
    const biome = this.currentBiome;
    const sheet = readySheet(biome);
    if (sheet) {
      this.setImageSprite(sheet);
    } else {
      sheetFor(biome).then(image => {
        if (this.currentBiome === biome) {
          this.setImageSprite(image);
        }
      });
    }
  }

  private emitLevel(initial: boolean) {
    emit('level', {
      level: this.levelIndex,
      biome: this.currentBiome,
      start: levelStart(this.levelIndex),
      next: levelStart(this.levelIndex + 1),
      initial,
    });
  }

  private changeLevel(level: number) {
    this.levelIndex = level;
    this.currentBiome = biomeForLevel(level);
    setObstacleBiome(this.currentBiome);
    this.applySheet();
    this.sfx.levelUp();
    // A wave of coins to welcome the player to the new world.
    this.untilCoins = 0;
    this.nextPattern = 'row';
    this.emitLevel(false);
  }

  // Hooks called by the Runner.

  afterFrame() {
    this.onFrame?.();
  }

  onPause() {
    emit('pause', null);
  }

  onGameOver() {
    emit('gameover', this.endRun());
  }

  onRunAbandoned() {
    this.endRun();
  }

  private endRun() {
    const coins = this.coinCount;
    const bank = addToCoinBank(coins);
    // Banked: don't count these coins twice.
    this.coinCount = 0;
    return {
      score: this.score,
      coins,
      bank,
      level: this.levelIndex,
      biome: this.currentBiome,
    };
  }

  /**
   * Moves and draws the coins, power-ups and particles (behind the dino).
   * @param spawn Whether new coins and power-ups may appear.
   */
  update(
      deltaTime: number, speed: number, spawn: boolean, distanceRan: number) {
    this.time += deltaTime;
    // Same step as the obstacles, so coins hanging over a cactus stay there.
    const groundMove = Math.floor(speed * FPS / 1000 * deltaTime);
    this.travelled += groundMove;

    this.runPoints = Math.round(distanceRan * SCORE_COEFFICIENT);
    const level = levelForScore(this.runPoints);
    if (level !== this.levelIndex) {
      this.changeLevel(level);
    }
    if (this.combo && this.time - this.lastCoinAt > COMBO_WINDOW_MS) {
      this.combo = 0;
    }

    this.updatePowerUpTimers(deltaTime);
    if (spawn) {
      this.spawnCoins(groundMove);
      this.spawnPowerUp(deltaTime);
    }
    this.updateCoins(deltaTime, groundMove);
    this.updateItems(groundMove);
    this.updateMotion(deltaTime, groundMove);
    this.updateParticles(deltaTime);
    if (!this.tRex.jumping) {
      this.doubleJumpUsed = false;
    }

    this.drawTrail();
    this.drawCoins();
    this.drawItems();
    this.drawParticles();
  }

  /** Effects attached to the dino, drawn in front of it. */
  drawOverlay() {
    this.drawDinoEffects();
    this.drawPopups();
  }

  /** Opacity for drawing the dino; it flickers while it can't be hurt. */
  trexAlpha(): number {
    const flicker = this.active.has('star') || this.invulnerableMs > 0;
    return flicker && Math.floor(this.time / 80) % 2 ? 0.35 : 1;
  }

  /** Squash on landing, stretch on take-off, anchored at the feet. */
  transformTrex(ctx: CanvasRenderingContext2D) {
    const sinceJump = this.time - this.jumpedAt;
    const sinceLand = this.time - this.landedAt;
    let sx = 1;
    let sy = 1;
    if (sinceLand < SQUASH_MS) {
      const k = 1 - sinceLand / SQUASH_MS;
      sx = 1 + 0.16 * k;
      sy = 1 - 0.16 * k;
    } else if (sinceJump < SQUASH_MS) {
      const k = 1 - sinceJump / SQUASH_MS;
      sx = 1 - 0.1 * k;
      sy = 1 + 0.14 * k;
    }
    if (sx === 1 && sy === 1) {
      return;
    }
    const t = this.tRex;
    const ax = t.xPos + (t.ducking ? 29 : 22);
    const ay = t.yPos + 46;
    ctx.translate(ax, ay);
    ctx.scale(sx, sy);
    ctx.translate(-ax, -ay);
  }

  /**
   * Called on a collision: 'smash' when a power-up breaks the obstacle,
   * 'pass' when the dino takes the hit (or is still blinking from one) and
   * runs on, false when the run is over.
   */
  absorbCollision(obstacle: Obstacle): CollisionOutcome {
    if (this.active.has('star')) {
      this.smash(obstacle, true);
      return 'smash';
    }
    if (this.invulnerableMs > 0) {
      return 'pass';
    }
    if (this.active.has('shield')) {
      this.active.delete('shield');
      this.invulnerableMs = SHIELD_INVULNERABLE_MS;
      this.smash(obstacle, false);
      emit('shieldbreak', null);
      return 'smash';
    }
    this.heartCount--;
    this.combo = 0;
    if (this.heartCount > 0) {
      this.invulnerableMs = HURT_INVULNERABLE_MS;
      this.hitStopUntil = performance.now() + HIT_STOP_MS;
      this.sfx.hurt();
      const {x, y} = this.dinoCenter();
      this.burst(x, y, '#ff6b6b', 10);
      emit('hurt', {hearts: this.heartCount});
      return 'pass';
    }
    emit('hurt', {hearts: 0});
    return false;
  }

  /** Whether a mid-air jump is allowed now; uses it up if so. */
  tryDoubleJump(): boolean {
    if (!this.active.has('doubleJump') || this.doubleJumpUsed) {
      return false;
    }
    this.doubleJumpUsed = true;
    this.jumpedAt = this.time;
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
        color: POWER_UP_COLORS.doubleJump.light,
      });
    }
    return true;
  }

  private addPoints(points: number) {
    this.bonusPoints += points;
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        age: 0,
        life: 450,
        size: 2,
        gravity: 0.1,
        color,
      });
    }
  }

  private smash(obstacle: Obstacle, withBonus: boolean) {
    this.sfx.smash();
    const cx = obstacle.xPos + obstacle.width / 2;
    const cy = obstacle.yPos + obstacle.typeConfig.height / 2;
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * obstacle.width,
        y: cy + (Math.random() - 0.5) * obstacle.typeConfig.height,
        vx: 1 + Math.random() * 4,
        vy: -2 - Math.random() * 4,
        age: 0,
        life: 700,
        size: 2 + Math.floor(Math.random() * 2),
        gravity: 0.35,
        color: i % 2 ? this.currentBiome.rock.base :
                       this.currentBiome.cactus.base,
      });
    }
    if (withBonus) {
      this.addPoints(SMASH_POINTS);
      this.popups.push({
        x: cx,
        y: obstacle.yPos - 10,
        text: `+${SMASH_POINTS}`,
        color: POWER_UP_COLORS.star.light,
        age: 0,
      });
    }
  }

  private dinoBox(): Box {
    const t = this.tRex;
    return t.ducking ? {x: t.xPos + 2, y: t.yPos + 18, width: 55, height: 25} :
                       {x: t.xPos + 2, y: t.yPos + 2, width: 40, height: 43};
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
    // Pterodactyls and rolling obstacles drift relative to the ground.
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
    const kind: PowerUpKind =
        this.heartCount < this.maxHearts && Math.random() < 0.35 ?
        'heart' :
        pickPowerUp();
    this.items.push({x: start + 10, y: Math.random() < 0.5 ? 100 : 64, kind});
    this.untilPowerUp = getRandomNum(10000, 16000) * this.luck();
  }

  private updatePowerUpTimers(deltaTime: number) {
    for (const [kind, state] of this.active) {
      if (state.remaining === Infinity) {
        continue;
      }
      state.remaining -= deltaTime;
      if (state.remaining <= 0) {
        this.active.delete(kind);
        this.sfx.powerDown();
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
        this.collectCoin(coin);
        return false;
      }
      return coin.x > -COIN_SIZE.width;
    });
  }

  private collectCoin(coin: Coin) {
    this.combo = this.time - this.lastCoinAt <= COMBO_WINDOW_MS ?
        this.combo + 1 :
        1;
    this.lastCoinAt = this.time;
    const multiplier = this.multiplier;
    this.coinCount++;
    this.addPoints(COIN_POINTS * multiplier);
    this.sfx.coin(multiplier);
    const x = coin.x + COIN_SIZE.width / 2;
    const y = coin.y + COIN_SIZE.height / 2;
    this.sparkle(x, y, '#ffe14d');
    emit('coin', {x, y, multiplier});
  }

  private updateItems(groundMove: number) {
    const dino = this.dinoBox();
    this.items = this.items.filter(item => {
      item.x -= groundMove;
      if (overlaps(
              dino,
              {x: item.x, y: item.y, width: ITEM_SIZE, height: ITEM_SIZE})) {
        this.activate(item);
        return false;
      }
      return item.x > -ITEM_SIZE;
    });
  }

  private activate(item: Item) {
    const {kind} = item;
    if (kind === 'heart') {
      this.heartCount = Math.min(this.maxHearts, this.heartCount + 1);
      this.sfx.heal();
      emit('heal', {hearts: this.heartCount});
    } else {
      const duration = durationOf(kind);
      this.active.set(kind, {remaining: duration, duration});
      this.sfx.powerUp();
    }
    const x = item.x + ITEM_SIZE / 2;
    const y = item.y + ITEM_SIZE / 2;
    this.burst(x, y, POWER_UP_COLORS[kind].light, 12);
    emit('powerup', {kind, x, y});
  }

  private sparkle(x: number, y: number, color: string) {
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
        color,
      });
    }
  }

  /** Jumps, landings, dust and the star's rainbow trail. */
  private updateMotion(deltaTime: number, groundMove: number) {
    const t = this.tRex;
    const feetY = 136;
    const puff = (count: number, spread: number, rise: number) => {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: t.xPos + 10 + Math.random() * 20,
          y: feetY + Math.random() * 3,
          vx: (Math.random() - 0.5) * spread - groundMove * 0.3,
          vy: -Math.random() * rise,
          age: 0,
          life: 380,
          size: 2,
          gravity: 0.04,
          color: this.currentBiome.dust,
        });
      }
    };
    if (t.jumping && !this.wasJumping) {
      this.jumpedAt = this.time;
      puff(4, 2, 0.8);
    } else if (!t.jumping && this.wasJumping) {
      this.landedAt = this.time;
      puff(9, 4, 1.2);
    } else if (!t.jumping) {
      this.untilDust -= deltaTime;
      if (this.untilDust <= 0) {
        this.untilDust = 90;
        puff(1, 0.6, 0.6);
      }
    }
    this.wasJumping = t.jumping;

    if (this.active.has('star')) {
      this.trail.unshift(this.dinoCenter().y);
      this.trail.length = Math.min(this.trail.length, 14);
    } else {
      this.trail = [];
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

  private drawTrail() {
    if (!this.trail.length) {
      return;
    }
    const colors =
        ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
    const box = this.dinoBox();
    this.ctx.save();
    this.trail.forEach((y, i) => {
      this.ctx.globalAlpha = 0.7 * (1 - i / this.trail.length);
      colors.forEach((color, band) => {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            box.x + 4 - (i + 1) * 4, Math.round(y) - 6 + band * 2, 4, 2);
      });
    });
    this.ctx.restore();
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
      this.ctx.save();
      this.ctx.globalAlpha = 0.22 + 0.15 * Math.sin(this.time / 160);
      this.ctx.fillStyle = POWER_UP_COLORS[item.kind].light;
      this.ctx.beginPath();
      this.ctx.arc(
          item.x + ITEM_SIZE / 2, item.y + bob + ITEM_SIZE / 2,
          ITEM_SIZE * 0.8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      drawSprite(this.ctx, sprites.boxes[item.kind], item.x, item.y + bob);
      drawSprite(
          this.ctx, sprites.icons[item.kind], item.x + 2, item.y + 2 + bob);
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
    if (this.active.has('shield')) {
      // Bubble with a rotating dotted rim.
      const colors = POWER_UP_COLORS.shield;
      this.ctx.globalAlpha = 0.16;
      this.ctx.fillStyle = colors.light;
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, 31, 29, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 0.85;
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
      this.ctx.globalAlpha = 0.65;
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
    this.ctx.font = `8px ${FONT}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    for (const popup of this.popups) {
      this.ctx.globalAlpha = 1 - popup.age / 800;
      this.ctx.fillStyle = '#1b1420';
      this.ctx.fillText(popup.text, popup.x + 1, popup.y + 1);
      this.ctx.fillStyle = popup.color;
      this.ctx.fillText(popup.text, popup.x, popup.y);
    }
    this.ctx.restore();
  }
}
