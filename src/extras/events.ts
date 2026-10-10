/**
 * Game events for the page around the canvas (level name, progress, coins).
 */

import type {Biome} from './biomes.js';

export interface LevelEvent {
  level: number;
  biome: Biome;
  // Score where this level starts and the next one begins.
  start: number;
  next: number;
}

export interface ProgressEvent {
  // Score with bonus points.
  score: number;
  // Score from the distance ran alone (it decides the level).
  distance: number;
  coins: number;
}

export interface GameOverEvent {
  score: number;
  coins: number;
  bank: number;
}

interface EventMap {
  'level': LevelEvent;
  'progress': ProgressEvent;
  'gameover': GameOverEvent;
  'start': null;
}

const target = new EventTarget();

export function emit<K extends keyof EventMap>(type: K, detail: EventMap[K]) {
  target.dispatchEvent(new CustomEvent(type, {detail}));
}

export function on<K extends keyof EventMap>(
    type: K, listener: (detail: EventMap[K]) => void) {
  target.addEventListener(
      type, e => listener((e as CustomEvent<EventMap[K]>).detail));
}
