/**
 * Pixel art for the extended game: '#' main colour, '-' light fill,
 * 'o' white, '.' transparent (see pixel_art.ts).
 */

import type {PixelSprite} from './pixel_art.js';
import {createSprite, rasterizeLines} from './pixel_art.js';

// Spinning coin: full face, then narrower as it turns edge-on.
const COIN_FRAMES = [
  [
    '....####....',
    '..##----##..',
    '.#--####--#.',
    '.#-#----#-#.',
    '#-#------#-#',
    '#-#------#-#',
    '#-#------#-#',
    '#-#------#-#',
    '.#-#----#-#.',
    '.#--####--#.',
    '..##----##..',
    '....####....',
  ],
  [
    '..####..',
    '.#----#.',
    '#--##--#',
    '#-#--#-#',
    '#-#--#-#',
    '#-#--#-#',
    '#-#--#-#',
    '#-#--#-#',
    '#-#--#-#',
    '#--##--#',
    '.#----#.',
    '..####..',
  ],
  [
    '.##.',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '#--#',
    '.##.',
  ],
  Array(12).fill('##'),
];

const ICONS = {
  shield: [
    '###########',
    '#---------#',
    '#-#######-#',
    '#-#######-#',
    '#-#######-#',
    '#-#######-#',
    '.#-#####-#.',
    '.#-#####-#.',
    '..#-###-#..',
    '...#---#...',
    '....###....',
  ],
  doubleJump: [
    '.....#.....',
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '.....#.....',
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '...........',
  ],
  magnet: [
    '...#####...',
    '.#########.',
    '####...####',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '---.....---',
    '---.....---',
    '---.....---',
    '...........',
  ],
  star: [
    '.....#.....',
    '.....#.....',
    '....###....',
    '....###....',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '..###.###..',
    '.##.....##.',
    '#.........#',
  ],
  slowMotion: [
    '###########',
    '.#.......#.',
    '.#-------#.',
    '..#-----#..',
    '...#---#...',
    '....#-#....',
    '...#.-.#...',
    '..#..-..#..',
    '.#...-...#.',
    '.#-------#.',
    '###########',
  ],
};

export type PowerUpKind = keyof typeof ICONS;

/** Frame around a power-up icon lying on the track. */
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
  '...######-#######.....',
  '...#####-########.....',
  '..######-########.##..',
  '..##############-####.',
  '.###############-#####',
  '.######-#######-######',
  '#######-##############',
  '######################',
  '######################',
  '######################',
  '######################',
];

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

const TUMBLEWEED_FRAME_COUNT = 16;

export interface Sprites {
  coin: PixelSprite[];
  icons: Record<PowerUpKind, PixelSprite>;
  box: PixelSprite;
  plus: PixelSprite;
  rock: PixelSprite;
  tumbleweed: PixelSprite[];
}

let sprites: Sprites|null = null;

/** Sprites are rendered once, on first use. */
export function getSprites(): Sprites {
  if (!sprites) {
    const icons = {} as Record<PowerUpKind, PixelSprite>;
    for (const kind of Object.keys(ICONS) as PowerUpKind[]) {
      icons[kind] = createSprite(ICONS[kind], false);
    }
    sprites = {
      coin: COIN_FRAMES.map(frame => createSprite(frame)),
      icons,
      box: createSprite(BOX, false),
      plus: createSprite(PLUS, false),
      rock: createSprite(ROCK),
      tumbleweed: Array.from(
          {length: TUMBLEWEED_FRAME_COUNT},
          (_, i) => createSprite(
              tumbleweedFrame(-i / TUMBLEWEED_FRAME_COUNT * Math.PI * 2))),
    };
  }
  return sprites;
}
