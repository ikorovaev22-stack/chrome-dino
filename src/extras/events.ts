/**
 * Game events for the interface around the game.
 */

import type {PowerUpKind} from './art.js';
import type {Biome} from './biomes.js';

export interface LevelEvent {
  level: number;
  biome: Biome;
  // Score where this level starts and the next one begins.
  start: number;
  next: number;
  // True for the first world of a run (no banner).
  initial: boolean;
}

export interface RunResult {
  score: number;
  coins: number;
  bank: number;
  level: number;
  biome: Biome;
}

interface EventMap {
  'level': LevelEvent;
  'start': null;
  'pause': null;
  'gameover': RunResult;
  // Positions are in the game's own coordinates (600x150 strip).
  'coin': {x: number, y: number, multiplier: number};
  'powerup': {kind: PowerUpKind, x: number, y: number};
  'hurt': {hearts: number};
  'heal': {hearts: number};
  'shieldbreak': null;
}

export type GameEventType = keyof EventMap;

const target = new EventTarget();

export function emit<K extends keyof EventMap>(type: K, detail: EventMap[K]) {
  target.dispatchEvent(new CustomEvent(type, {detail}));
}

export function on<K extends keyof EventMap>(
    type: K, listener: (detail: EventMap[K]) => void) {
  target.addEventListener(
      type, e => listener((e as CustomEvent<EventMap[K]>).detail));
}
