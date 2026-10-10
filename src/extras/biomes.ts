/**
 * Worlds the run passes through, one per level. Each has its own colours,
 * background, weather and extra obstacles.
 */

export type BiomeId = 'desert'|'canyon'|'forest'|'snow'|'volcano';
export type WeatherKind =
    'clear'|'rain'|'snow'|'sand'|'leaves'|'embers'|'blizzard';
export type ExtraObstacleKind =
    'rock'|'tumbleweed'|'log'|'stump'|'snowman'|'snowball'|'geyser';
export type LayerShape = 'dunes'|'mesas'|'hills'|'forest'|'peaks'|'volcanoes';
export type Ambient = 'none'|'birds'|'smoke';

export interface SpritePalette {
  base: string;
  light: string;
  dark: string;
  outline: string;
  // Painted on the top edge (snow caps).
  cap?: string;
}

export interface Layer {
  shape: LayerShape;
  color: string;
  // Highlights: snow on peaks, lava on volcanoes, lit tree tops.
  accent?: string;
  // Tallest point above the horizon, in game pixels.
  height: number;
  // Share of the ground speed this layer scrolls at.
  speed: number;
}

export interface Biome {
  id: BiomeId;
  name: string;
  sky: [string, string];
  nightSky: [string, string];
  sun: {color: string, glow: string, y: number}|null;
  far: Layer;
  near: Layer;
  ground: string;
  groundDark: string;
  // The original horizon line sprite.
  line: string;
  // Fill and outline of the clouds (white by default).
  clouds?: {fill: string, line: string};
  cactus: SpritePalette;
  rock: SpritePalette;
  dust: string;
  weather: WeatherKind[];
  ambient: Ambient;
  // Chance that an obstacle is one of this world's extra obstacles.
  extraChance: number;
  extras: Array<{kind: ExtraObstacleKind, weight: number, minSpeed?: number}>;
}

export const BIOMES: Biome[] = [
  {
    id: 'desert',
    name: 'Пустыня',
    sky: ['#6cc4f0', '#fde8b5'],
    nightSky: ['#0b1736', '#2d3a78'],
    sun: {color: '#fff3a8', glow: 'rgba(255, 230, 140, 0.35)', y: 34},
    far: {shape: 'dunes', color: '#f2cf8f', height: 34, speed: 0.06},
    near: {shape: 'dunes', color: '#e7b56e', height: 20, speed: 0.18},
    ground: '#f0cf91',
    groundDark: '#d9ad66',
    line: '#9a6a3a',
    cactus: {
      base: '#4fa34a',
      light: '#7ccc63',
      dark: '#357a37',
      outline: '#1d4d22',
    },
    rock: {
      base: '#c79a62',
      light: '#e3bd84',
      dark: '#a07445',
      outline: '#5e4024',
    },
    dust: '#e2bf82',
    weather: ['clear', 'sand'],
    ambient: 'none',
    extraChance: 0.25,
    extras: [
      {kind: 'rock', weight: 1},
      {kind: 'tumbleweed', weight: 1, minSpeed: 7},
    ],
  },
  {
    id: 'canyon',
    name: 'Каньон',
    sky: ['#ff8a65', '#ffd59a'],
    nightSky: ['#1d1035', '#4a2a6a'],
    sun: {color: '#ffe08a', glow: 'rgba(255, 170, 90, 0.45)', y: 62},
    far: {shape: 'mesas', color: '#d0705a', height: 46, speed: 0.06},
    near: {shape: 'mesas', color: '#a8503f', height: 26, speed: 0.18},
    ground: '#dd8e60',
    groundDark: '#c0704a',
    line: '#7a3426',
    clouds: {fill: '#fff0e6', line: '#f0b49a'},
    cactus: {
      base: '#6f9a45',
      light: '#98c060',
      dark: '#4f7533',
      outline: '#2c4220',
    },
    rock: {
      base: '#b4553f',
      light: '#d27a5d',
      dark: '#8b3e2e',
      outline: '#4d2018',
    },
    dust: '#e9a77d',
    weather: ['clear', 'sand'],
    ambient: 'birds',
    extraChance: 0.3,
    extras: [
      {kind: 'rock', weight: 2},
      {kind: 'tumbleweed', weight: 1, minSpeed: 7},
    ],
  },
  {
    id: 'forest',
    name: 'Лес',
    sky: ['#7fd0ff', '#dff6d0'],
    nightSky: ['#08182a', '#1d3d4f'],
    sun: {color: '#fffbe0', glow: 'rgba(255, 255, 210, 0.3)', y: 28},
    far: {shape: 'hills', color: '#84c27c', height: 36, speed: 0.06},
    near: {
      shape: 'forest',
      color: '#3f8a52',
      accent: '#56a865',
      height: 30,
      speed: 0.2,
    },
    ground: '#78bf55',
    groundDark: '#5a9d3e',
    line: '#3e6b2a',
    cactus: {
      base: '#2f8f4f',
      light: '#52b86b',
      dark: '#1f6b3a',
      outline: '#123d22',
    },
    rock: {
      base: '#8a9478',
      light: '#a9b593',
      dark: '#6a7259',
      outline: '#3a3f30',
      cap: '#5aa84a',
    },
    dust: '#8fcf6a',
    weather: ['clear', 'rain', 'leaves'],
    ambient: 'birds',
    extraChance: 0.45,
    extras: [
      {kind: 'log', weight: 2},
      {kind: 'stump', weight: 2},
      {kind: 'rock', weight: 1},
    ],
  },
  {
    id: 'snow',
    name: 'Снежные горы',
    sky: ['#9cc8ff', '#eef6ff'],
    nightSky: ['#081028', '#243a6e'],
    sun: {color: '#ffffff', glow: 'rgba(255, 255, 255, 0.35)', y: 30},
    far: {
      shape: 'peaks',
      color: '#b9cfee',
      accent: '#ffffff',
      height: 62,
      speed: 0.05,
    },
    near: {
      shape: 'peaks',
      color: '#91afd8',
      accent: '#f4f8ff',
      height: 34,
      speed: 0.16,
    },
    ground: '#f4f8ff',
    groundDark: '#d4e2f5',
    line: '#7d9cc4',
    cactus: {
      base: '#4f9a9c',
      light: '#7cc3c2',
      dark: '#357375',
      outline: '#1d4447',
      cap: '#ffffff',
    },
    rock: {
      base: '#9fd3f0',
      light: '#d8f1ff',
      dark: '#6fa9cf',
      outline: '#3c6a8c',
    },
    dust: '#ffffff',
    weather: ['snow', 'blizzard'],
    ambient: 'none',
    extraChance: 0.5,
    extras: [
      {kind: 'snowman', weight: 2},
      {kind: 'snowball', weight: 2, minSpeed: 7},
      {kind: 'rock', weight: 1},
    ],
  },
  {
    id: 'volcano',
    name: 'Вулкан',
    sky: ['#2a1335', '#ff7a3d'],
    nightSky: ['#0d0614', '#5a1a2a'],
    sun: null,
    far: {
      shape: 'volcanoes',
      color: '#3a1d33',
      accent: '#ff5a1f',
      height: 64,
      speed: 0.05,
    },
    near: {shape: 'mesas', color: '#24131f', height: 24, speed: 0.16},
    ground: '#3b2a2e',
    groundDark: '#2a1d21',
    line: '#ff6a2b',
    clouds: {fill: '#5e4656', line: '#3e2a38'},
    cactus: {
      base: '#3a2a2e',
      light: '#ff8a3d',
      dark: '#21171a',
      outline: '#0e090b',
    },
    rock: {
      base: '#4a3a42',
      light: '#ff7a2e',
      dark: '#2c2228',
      outline: '#120c0f',
    },
    dust: '#6b4a4a',
    weather: ['embers'],
    ambient: 'smoke',
    extraChance: 0.45,
    extras: [
      {kind: 'geyser', weight: 3},
      {kind: 'rock', weight: 1},
    ],
  },
];

/**
 * Score at which each level starts. After the last one, a new level comes
 * every LEVEL_STEP points and the worlds repeat.
 */
const LEVEL_STARTS = [0, 400, 900, 1500, 2200];
const LEVEL_STEP = 800;

export function levelForScore(score: number): number {
  let level = 0;
  while (levelStart(level + 1) <= score) {
    level++;
  }
  return level;
}

/** Score at which a level (0-based) starts. */
export function levelStart(level: number): number {
  if (level < LEVEL_STARTS.length) {
    return LEVEL_STARTS[level]!;
  }
  return LEVEL_STARTS.at(-1)! + (level - LEVEL_STARTS.length + 1) * LEVEL_STEP;
}

export function biomeForLevel(level: number): Biome {
  return BIOMES[level % BIOMES.length]!;
}
