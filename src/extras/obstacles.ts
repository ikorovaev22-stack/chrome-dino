/**
 * Extra obstacle types. They plug into the original Obstacle class, so gaps,
 * collisions and audio cues work exactly like for the cacti.
 */

import {FPS} from '../dino_game/constants.js';
import type {Dimensions} from '../dino_game/dimensions.js';
import type {GameStateProvider} from '../dino_game/game_state_provider.js';
import type {ImageSpriteProvider} from '../dino_game/image_sprite_provider.js';
import {Obstacle} from '../dino_game/obstacle.js';
import type {ObstacleType} from '../dino_game/offline_sprite_definitions.js';

import {getSprites} from './art.js';
import {drawSprite} from './pixel_art.js';

/** Bottom edge of ground obstacles, the same as for the cacti. */
const GROUND = 140;

// Collision boxes are relative to the art, inside the 1px outline.
const ROCK: ObstacleType = {
  type: 'obstacle',
  width: 24,
  height: 16,
  yPos: GROUND - 16,
  multipleSpeed: 999,
  minGap: 120,
  minSpeed: 0,
  collisionBoxes: [
    {x: 4, y: 1, width: 12, height: 5},
    {x: 1, y: 6, width: 20, height: 8},
  ],
};

const TUMBLEWEED: ObstacleType = {
  type: 'obstacle2',
  width: 21,
  height: 21,
  yPos: GROUND - 21,
  multipleSpeed: 999,
  minGap: 150,
  minSpeed: 7,
  collisionBoxes: [
    {x: 5, y: 2, width: 9, height: 15},
    {x: 2, y: 5, width: 15, height: 9},
  ],
};

/** The tumbleweed rolls a bit faster than the ground moves. */
const TUMBLEWEED_EXTRA_SPEED = 0.8;
const TUMBLEWEED_BOUNCE_HEIGHT = 22;
/** Ground covered by one bounce, in pixels. */
const TUMBLEWEED_BOUNCE_LENGTH = 90;

class Rock extends Obstacle {
  protected override draw() {
    drawSprite(this.canvasCtx, getSprites().rock, this.xPos, this.yPos);
  }
}

class Tumbleweed extends Obstacle {
  // Note: Obstacle's constructor draws before this field is initialized.
  private rolled: number = 0;

  override update(deltaTime: number, speed: number) {
    if (!this.remove) {
      this.rolled += (speed + TUMBLEWEED_EXTRA_SPEED) * FPS / 1000 * deltaTime;
      const bounce = Math.abs(
          Math.sin(this.rolled / TUMBLEWEED_BOUNCE_LENGTH * Math.PI));
      this.yPos = (TUMBLEWEED.yPos as number) -
          Math.round(bounce * TUMBLEWEED_BOUNCE_HEIGHT);
    }
    super.update(deltaTime, speed + TUMBLEWEED_EXTRA_SPEED);
  }

  protected override draw() {
    const frames = getSprites().tumbleweed;
    const frame = Math.floor((this.rolled || 0) / 3) % frames.length;
    drawSprite(this.canvasCtx, frames[frame]!, this.xPos, this.yPos);
  }
}

let lastWasExtra = false;

/**
 * Called by the horizon before it picks an obstacle; returns an extra
 * obstacle now and then (never two in a row), otherwise null.
 */
export function createExtraObstacle(
    canvasCtx: CanvasRenderingContext2D, dimensions: Dimensions,
    gapCoefficient: number, speed: number,
    resourceProvider: ImageSpriteProvider&GameStateProvider): Obstacle|null {
  if (lastWasExtra) {
    lastWasExtra = false;
    return null;
  }
  const roll = Math.random();
  let type: ObstacleType|null = null;
  // The bouncing tumbleweed is left out of the audio cue mode, where players
  // rely on sound alone.
  if (roll < 0.15 && speed >= TUMBLEWEED.minSpeed &&
      !resourceProvider.hasAudioCues) {
    type = TUMBLEWEED;
  } else if (roll > 0.87) {
    type = ROCK;
  }
  if (!type) {
    return null;
  }
  lastWasExtra = true;
  const ObstacleClass = type === TUMBLEWEED ? Tumbleweed : Rock;
  return new ObstacleClass(
      canvasCtx, type, {x: 0, y: 0}, dimensions, gapCoefficient, speed,
      type.width, resourceProvider);
}
