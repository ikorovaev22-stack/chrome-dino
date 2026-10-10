/**
 * Pixel art for the coloured game. '.' is transparent; '#', 'L', 'D' are the
 * base, light and dark tones of a palette (see shade() in pixel_art.ts);
 * other letters are named in each sprite's palette.
 */

import type {Biome} from './biomes.js';
import type {PixelSprite} from './pixel_art.js';
import {createSprite, paletteFor, rasterizeLines, shade} from './pixel_art.js';

// Spinning coin: full face, then narrower as it turns edge-on.
const COIN_FRAMES = [
  [
    '....####....',
    '..##yyyy##..',
    '.#yy####yy#.',
    '.#y#wyyyy#y#',
    '#y#wyyyyyy#y',
    '#y#yyyyyyy#y',
    '#y#yyyyyyy#y',
    '#y#yyyyyyy#y',
    '.#y#yyyyy#y#',
    '.#yy####yy#.',
    '..##yyyy##..',
    '....####....',
  ],
  [
    '..####..',
    '.#yyyy#.',
    '#yy##yy#',
    '#y#wy#y#',
    '#y#yy#y#',
    '#y#yy#y#',
    '#y#yy#y#',
    '#y#yy#y#',
    '#y#yy#y#',
    '#yy##yy#',
    '.#yyyy#.',
    '..####..',
  ],
  [
    '.##.',
    '#yw#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '#yy#',
    '.##.',
  ],
  Array(12).fill('##'),
];
const COIN_PALETTE = {'#': '#d18a12', 'y': '#ffd23f', 'w': '#fff6c0'};

const ICONS = {
  shield: [
    '###########',
    '#LLLLLLLLL#',
    '#L#######D#',
    '#L#######D#',
    '#L#######D#',
    '#L#######D#',
    '.#L#####D#.',
    '.#L#####D#.',
    '..#L###D#..',
    '...#LDD#...',
    '....###....',
  ],
  doubleJump: [
    '.....#.....',
    '....#L#....',
    '...#L#D#...',
    '..#L#.#D#..',
    '.#L#...#D#.',
    '.....#.....',
    '....#L#....',
    '...#L#D#...',
    '..#L#.#D#..',
    '.#L#...#D#.',
    '...........',
  ],
  magnet: [
    '...#####...',
    '.##LLLLL##.',
    '#LL#####LD#',
    '#L#.....#D#',
    '#L#.....#D#',
    '#L#.....#D#',
    '#L#.....#D#',
    'sss.....sss',
    'sss.....sss',
    'sss.....sss',
    '...........',
  ],
  star: [
    '.....#.....',
    '....#L#....',
    '....#L#....',
    '#####L#####',
    '#LLLLLLLLD#',
    '.#LLLLLLD#.',
    '..#LLLLD#..',
    '..#LL#LD#..',
    '.#LD#.#LD#.',
    '.#D#...#D#.',
    '.##.....##.',
  ],
  slowMotion: [
    '###########',
    '.#.......#.',
    '.#sssssss#.',
    '..#sssss#..',
    '...#sss#...',
    '....#s#....',
    '...#.s.#...',
    '..#..s..#..',
    '.#...s...#.',
    '.#sssssss#.',
    '###########',
  ],
};

export type PowerUpKind = keyof typeof ICONS;

/** Colour of each power-up: icon, frame of its box and timer bar. */
export const POWER_UP_COLORS: Record<PowerUpKind, {
  main: string, light: string, dark: string, extra?: string,
}> = {
  shield: {main: '#2f7be0', light: '#8cc4ff', dark: '#1d4f9a'},
  doubleJump: {main: '#2fb562', light: '#8ef0b0', dark: '#1d7a40'},
  magnet: {main: '#e53b3b', light: '#ff8a8a', dark: '#9a1f1f', extra: '#dfe5ec'},
  star: {main: '#f5b400', light: '#ffe680', dark: '#b07f00'},
  slowMotion: {main: '#7b4fd0', light: '#b89cf0', dark: '#4e2d94', extra: '#ffcf70'},
};

/** Frame around a power-up lying on the track; '#' takes the power-up colour. */
const BOX = [
  '..#############..',
  '.#ooooooooooooo#.',
  '#ooooooooooooooo#',
  ...Array(11).fill('#ooooooooooooooo#'),
  '#ooooooooooooooo#',
  '.#ooooooooooooo#.',
  '..#############..',
];

/** '+' in the style of the score digits (10x13 cell). */
const PLUS = [
  '..........',
  '..........',
  '....##....',
  '....##....',
  '..######..',
  '..######..',
  '....##....',
  '....##....',
  '..........',
];

const ROCK = [
  '.......######.........',
  '.....##########.......',
  '....############......',
  '...######.#######.....',
  '...#####.########.....',
  '..######.########.##..',
  '..##############.####.',
  '.###############.#####',
  '.######.#######.######',
  '#######.##############',
  '######################',
  '######################',
  '######################',
  '######################',
];

const LOG = [
  '..cccc##########################',
  '.cRRRRc#########################',
  'cRccccRc#DDDD####DDDD#####DDDD##',
  'cRcRRcRc########################',
  'cRcRRcRc###DDDD#####DDDD####DDD#',
  'cRcRRcRc########################',
  'cRccccRc#DDDD####DDDD#####DDDD##',
  '.cRRRRc#########################',
  '..cccc##########################',
];

const STUMP = [
  '....cccccccc....',
  '..ccRRRRRRRRcc..',
  '.#cccccccccccc#.',
  '.##D###D###D###.',
  '.###D###D###D##.',
  '.##D###D###D###.',
  '.###D###D###D##.',
  '.##D###D###D###.',
  '.###D###D###D##.',
  '.##D###D###D###.',
  '####D###D###D###',
  '################',
  '#####......#####',
];
const WOOD = {
  '#': '#8a5a32',
  'D': '#6b4226',
  'c': '#e8c48a',
  'R': '#b07a48',
};

const SNOWMAN = [
  '.....wwwwww.....',
  '....wwwwwwgg....',
  '...wwkwwwkwgg...',
  '...wwwwwwwwwg...',
  '...wwwwnnnnnn...',
  '...wwwwwwwwwg...',
  '....wkwkwkwgg...',
  '.....wwwwwgg....',
  '...SSSSSSSSSS...',
  '....SSSSSSSSSSS.',
  '....wwwwwwwgSS..',
  'b..wwwwwwwwwgg.b',
  '.b.wwwwkwwwwwgb.',
  '..bwwwwwwwwwwgb.',
  '..wbwwwkwwwwwbg.',
  '..wwwwwwwwwwwwg.',
  '..wwwwwkwwwwwgg.',
  '...wwwwwwwwwgg..',
  '....wwwwwwwgg...',
  '..wwwwwwwwwwwg..',
  '.wwwwwwwwwwwwgg.',
  'wwwwwwwwwwwwwwgg',
  'wwwwwwwwwwwwwwgg',
  'wwwwwwwwwwwwwwgg',
  'wwwwwwwwwwwwwwgg',
  'wwwwwwwwwwwwwggg',
  '.wwwwwwwwwwwwgg.',
  '..wwwwwwwwwwgg..',
];
const SNOWMAN_PALETTE = {
  'w': '#ffffff',
  'g': '#bcd3ee',
  'k': '#2b2b38',
  'n': '#ff8a2a',
  'S': '#e5383b',
  'b': '#7a4a26',
};

/** Vent of a lava geyser. */
const VENT = [
  '.....oooooooo.....',
  '...##oooooooo##...',
  '..#####rrrr#####..',
  '.######rrrr######.',
  '##################',
];
const VENT_PALETTE = {'#': '#3a2a30', 'o': '#ffb030', 'r': '#ff5a1f'};

/**
 * Tumbleweed: a slightly lumpy ring with tangled twigs inside. Each frame
 * rotates the whole shape, so it reads as rolling.
 */
function tumbleweedFrame(rotation: number): string[] {
  const size = 19;
  const c = (size - 1) / 2;
  const radii = [8.6, 8, 8.8, 7.8, 8.5, 8.2, 8.9, 7.9];
  const point = (angle: number, r: number): [number, number] => [
    c + Math.cos(angle + rotation) * r,
    c + Math.sin(angle + rotation) * r,
  ];
  const lines: Array<[number, number, number, number]> = [];
  for (let i = 0; i < radii.length; i++) {
    const a0 = i / radii.length * Math.PI * 2;
    const a1 = (i + 1) / radii.length * Math.PI * 2;
    lines.push([
      ...point(a0, radii[i]!),
      ...point(a1, radii[(i + 1) % radii.length]!),
    ]);
  }
  const twigs: Array<[number, number, number, number]> = [
    [0.3, 8, 2.6, 7.5],
    [1.2, 8, 4.1, 6],
    [2.2, 7.5, 5.5, 8],
    [3.5, 8, 0.9, 4],
    [4.4, 7, 1.6, 2],
    [5.6, 8, 3.1, 3],
    [2.9, 5, 4.9, 5],
  ];
  for (const [a0, r0, a1, r1] of twigs) {
    lines.push([...point(a0, r0), ...point(a1, r1)]);
  }
  return rasterizeLines(size, lines);
}

/** Snowball: a shaded disc with a few marks that turn as it rolls. */
function snowballFrame(rotation: number): string[] {
  const size = 19;
  const c = (size - 1) / 2;
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > 9.2) {
        row += '.';
        continue;
      }
      // Shadow on the lower right.
      row += dx + dy > 7 ? 'g' : 'w';
    }
    rows.push(row);
  }
  const grid = rows.map(row => [...row]);
  for (let i = 0; i < 3; i++) {
    const angle = rotation + i * Math.PI * 2 / 3;
    const x = Math.round(c + Math.cos(angle) * 5);
    const y = Math.round(c + Math.sin(angle) * 5);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
      grid[y + dy!]![x + dx!] = 'g';
    }
  }
  return grid.map(row => row.join(''));
}

const ROLL_FRAMES = 16;

export interface Sprites {
  coin: PixelSprite[];
  icons: Record<PowerUpKind, PixelSprite>;
  boxes: Record<PowerUpKind, PixelSprite>;
  plus: PixelSprite;
  tumbleweed: PixelSprite[];
  snowball: PixelSprite[];
  log: PixelSprite;
  stump: PixelSprite;
  snowman: PixelSprite;
  vent: PixelSprite;
}

let sprites: Sprites|null = null;
const rocks = new Map<string, PixelSprite>();

/** Sprites are rendered once, on first use. */
export function getSprites(): Sprites {
  if (!sprites) {
    const icons = {} as Record<PowerUpKind, PixelSprite>;
    const boxes = {} as Record<PowerUpKind, PixelSprite>;
    for (const kind of Object.keys(ICONS) as PowerUpKind[]) {
      const colors = POWER_UP_COLORS[kind];
      icons[kind] = createSprite(ICONS[kind], {
        palette: {
          '#': colors.main,
          'L': colors.light,
          'D': colors.dark,
          's': colors.extra ?? colors.light,
        },
        outline: '#ffffff',
      });
      boxes[kind] = createSprite(BOX, {
        palette: {'#': colors.dark, 'o': '#ffffff'},
        outline: null,
      });
    }
    sprites = {
      coin: COIN_FRAMES.map(
          frame => createSprite(
              frame, {palette: COIN_PALETTE, outline: '#7a4d06'})),
      icons,
      boxes,
      plus: createSprite(
          PLUS, {palette: {'#': '#fff4dc'}, outline: '#3d2b1f'}),
      tumbleweed: Array.from(
          {length: ROLL_FRAMES},
          (_, i) => createSprite(
              tumbleweedFrame(-i / ROLL_FRAMES * Math.PI * 2),
              {palette: {'#': '#9a6634'}, outline: null})),
      snowball: Array.from(
          {length: ROLL_FRAMES},
          (_, i) => createSprite(
              snowballFrame(-i / ROLL_FRAMES * Math.PI * 2),
              {palette: SNOWMAN_PALETTE, outline: '#7d9cc4'})),
      log: createSprite(LOG, {palette: WOOD, outline: '#3a2414'}),
      stump: createSprite(STUMP, {palette: WOOD, outline: '#3a2414'}),
      snowman: createSprite(
          SNOWMAN, {palette: SNOWMAN_PALETTE, outline: '#5f7fa8'}),
      vent: createSprite(VENT, {palette: VENT_PALETTE, outline: '#120c0f'}),
    };
  }
  return sprites;
}

/** Rocks take the colours of the world they lie in. */
export function getRockSprite(biome: Biome): PixelSprite {
  let rock = rocks.get(biome.id);
  if (!rock) {
    rock = createSprite(shade(ROCK, !!biome.rock.cap), {
      palette: paletteFor(biome.rock),
      outline: biome.rock.outline,
    });
    rocks.set(biome.id, rock);
  }
  return rock;
}
