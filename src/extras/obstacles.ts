/**
 * Extra obstacle types, picked by the world the run is in. They plug into the
 * original Obstacle class, so gaps, collisions and audio cues work exactly
 * like for the cacti.
 */

import {FPS} from '../dino_game/constants.js';
import type {Dimensions} from '../dino_game/dimensions.js';
import type {GameStateProvider} from '../dino_game/game_state_provider.js';
import type {ImageSpriteProvider} from '../dino_game/image_sprite_provider.js';
import {Obstacle} from '../dino_game/obstacle.js';
import type {ObstacleType} from '../dino_game/offline_sprite_definitions.js';
import {CollisionBox} from '../dino_game/offline_sprite_definitions.js';

import {getRockSprite, getSprites} from './art.js';
import type {Biome, ExtraObstacleKind} from './biomes.js';
import {BIOMES} from './biomes.js';
import type {PixelSprite} from './pixel_art.js';
import {drawSprite} from './pixel_art.js';

/** Bottom edge of ground obstacles, the same as for the cacti. */
const GROUND = 140;

function groundType(
    type: ObstacleType['type'], width: number, height: number,
    boxes: Array<[number, number, number, number]>, minGap = 120): ObstacleType {
  return {
    type,
    width,
    height,
    yPos: GROUND - height,
    multipleSpeed: 999,
    minGap,
    minSpeed: 0,
    // Relative to the art, inside the 1px outline.
    collisionBoxes: boxes.map(([x, y, w, h]) => new CollisionBox(x, y, w, h)),
  };
}

// 'obstacle' and 'obstacle2' are the sprite sheet's slots for obstacles of
// other game modes; the extra types reuse them (2 for the moving ones).
const TYPES: Record<ExtraObstacleKind, ObstacleType> = {
  rock: groundType('obstacle', 24, 16, [[4, 1, 12, 5], [1, 6, 20, 8]]),
  tumbleweed: groundType(
      'obstacle2', 21, 21, [[5, 2, 9, 15], [2, 5, 15, 9]], 150),
  snowball: groundType(
      'obstacle2', 21, 21, [[5, 1, 9, 17], [1, 5, 17, 9]], 150),
  log: groundType('obstacle', 34, 11, [[1, 1, 30, 8]]),
  stump: groundType('obstacle', 18, 15, [[2, 1, 12, 12]]),
  snowman: groundType('obstacle', 18, 30, [[4, 1, 8, 10], [2, 11, 12, 16]]),
  geyser: groundType('obstacle2', 20, 7, [], 160),
};

class SpriteObstacle extends Obstacle {
  // Note: Obstacle's constructor draws before subclass fields are set.
  sprite?: PixelSprite;

  protected override draw() {
    if (this.sprite) {
      drawSprite(this.canvasCtx, this.sprite, this.xPos, this.yPos);
    }
  }
}

/** Rolls a bit faster than the ground and bounces. */
class RollingObstacle extends Obstacle {
  frames?: PixelSprite[];
  bounce: number = 0;
  private rolled: number = 0;

  override update(deltaTime: number, speed: number) {
    const extraSpeed = 0.8;
    if (!this.remove) {
      this.rolled += (speed + extraSpeed) * FPS / 1000 * deltaTime;
      const hop = Math.abs(Math.sin(this.rolled / 90 * Math.PI));
      this.yPos = (this.typeConfig.yPos as number) -
          Math.round(hop * this.bounce);
    }
    super.update(deltaTime, speed + extraSpeed);
  }

  protected override draw() {
    if (this.frames) {
      const frame = Math.floor((this.rolled || 0) / 3) % this.frames.length;
      drawSprite(this.canvasCtx, this.frames[frame]!, this.xPos, this.yPos);
    }
  }
}

const GEYSER_MAX = 42;
const GEYSER_CYCLE = 1900;

/**
 * A lava vent that erupts in a cycle: rest, rise, spray, fall. The lava
 * column is only dangerous while it's up.
 */
class Geyser extends Obstacle {
  private clock: number = Math.random() * GEYSER_CYCLE;
  private column: number = 0;

  override update(deltaTime: number, speed: number) {
    if (!this.remove) {
      this.clock = (this.clock + deltaTime) % GEYSER_CYCLE;
      const t = this.clock / GEYSER_CYCLE;
      // 0-0.35 rest, 0.35-0.5 rise, 0.5-0.75 spray, 0.75-0.9 fall.
      const height = t < 0.35 ? 0 :
          t < 0.5             ? (t - 0.35) / 0.15 :
          t < 0.75            ? 1 :
          t < 0.9             ? 1 - (t - 0.75) / 0.15 :
                                0;
      this.column = Math.round(height * GEYSER_MAX);
      // The obstacle box grows with the column; the vent itself is safe.
      const total = 7 + this.column;
      this.typeConfig = {...this.typeConfig, height: total};
      this.yPos = GROUND - total;
      this.collisionBoxes = this.column > 6 ?
          [new CollisionBox(6, 0, 7, this.column)] :
          [];
    }
    super.update(deltaTime, speed);
  }

  protected override draw() {
    const ctx = this.canvasCtx;
    const ventY = GROUND - 7;
    drawSprite(ctx, getSprites().vent, this.xPos, ventY);
    if (this.column > 0) {
      const top = ventY - this.column + 2;
      const x = Math.round(this.xPos);
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(x + 6, top, 8, this.column);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x + 8, top + 2, 4, this.column - 2);
      // Spray at the top.
      ctx.fillStyle = '#ffb030';
      for (let i = 0; i < 6; i++) {
        const sx = x + 4 + Math.floor(Math.random() * 12);
        const sy = top - Math.floor(Math.random() * 5);
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }
}

let biome: Biome = BIOMES[0]!;
let lastKind: ExtraObstacleKind|null = null;

/** The world new obstacles come from. */
export function setObstacleBiome(next: Biome) {
  biome = next;
}

function pickKind(speed: number, audioCues: boolean): ExtraObstacleKind|null {
  const options = biome.extras.filter(
      option => speed >= (option.minSpeed ?? 0) &&
          // Moving obstacles are left out of the audio cue mode, where
          // players rely on sound alone.
          !(audioCues && TYPES[option.kind].type === 'obstacle2'));
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      return option.kind;
    }
  }
  return null;
}

/**
 * Called by the horizon before it picks an obstacle; returns one of the
 * world's extra obstacles now and then, otherwise null.
 */
export function createExtraObstacle(
    canvasCtx: CanvasRenderingContext2D, dimensions: Dimensions,
    gapCoefficient: number, speed: number,
    resourceProvider: ImageSpriteProvider&GameStateProvider): Obstacle|null {
  if (Math.random() >= biome.extraChance) {
    lastKind = null;
    return null;
  }
  let kind = pickKind(speed, resourceProvider.hasAudioCues);
  // Avoid the same moving obstacle twice in a row.
  if (kind && kind === lastKind && TYPES[kind].type === 'obstacle2') {
    kind = null;
  }
  lastKind = kind;
  if (!kind) {
    return null;
  }

  const type = TYPES[kind];
  const args = [
    canvasCtx, {...type}, {x: 0, y: 0}, dimensions, gapCoefficient, speed,
    type.width, resourceProvider,
  ] as const;
  const sprites = getSprites();
  switch (kind) {
    case 'tumbleweed':
    case 'snowball': {
      const obstacle = new RollingObstacle(...args);
      obstacle.frames = kind === 'tumbleweed' ? sprites.tumbleweed :
                                                 sprites.snowball;
      obstacle.bounce = kind === 'tumbleweed' ? 22 : 10;
      return obstacle;
    }
    case 'geyser':
      return new Geyser(...args);
    default: {
      const obstacle = new SpriteObstacle(...args);
      obstacle.sprite = kind === 'rock' ? getRockSprite(biome) :
          kind === 'log'                ? sprites.log :
          kind === 'stump'              ? sprites.stump :
                                          sprites.snowman;
      return obstacle;
    }
  }
}
