/**
 * Coloured sprite sheets: one per world, for the chosen dino skin.
 */

import type {Biome} from './biomes.js';
import {BIOMES} from './biomes.js';
import {buildSheet} from './recolor.js';
import type {Skin} from './skins.js';

let original: HTMLImageElement|null = null;
let scale: 1|2 = 1;
let skin: Skin|null = null;
const sheets = new Map<string, Promise<HTMLImageElement>>();
const ready = new Map<string, HTMLImageElement>();
const listeners: Array<() => void> = [];

const key = (biome: Biome, forSkin: Skin) => `${biome.id}:${forSkin.id}`;

function request(biome: Biome, forSkin: Skin): Promise<HTMLImageElement> {
  const k = key(biome, forSkin);
  let sheet = sheets.get(k);
  if (!sheet) {
    sheet = buildSheet(original!, scale, biome, forSkin).then(image => {
      ready.set(k, image);
      return image;
    });
    sheets.set(k, sheet);
  }
  return sheet;
}

/**
 * Prepares the sheets for every world; resolves with the first world's one.
 */
export async function initTheme(
    sourceSheet: HTMLImageElement, sheetScale: 1|2,
    initialSkin: Skin): Promise<HTMLImageElement> {
  original = sourceSheet;
  scale = sheetScale;
  skin = initialSkin;
  const first = await request(BIOMES[0]!, initialSkin);
  // The other worlds are built in the background.
  for (const biome of BIOMES.slice(1)) {
    request(biome, initialSkin);
  }
  return first;
}

export function getSkin(): Skin|null {
  return skin;
}

/** The sheet for a world, if it's ready. */
export function readySheet(biome: Biome): HTMLImageElement|null {
  return skin ? ready.get(key(biome, skin)) ?? null : null;
}

export function sheetFor(biome: Biome): Promise<HTMLImageElement> {
  return request(biome, skin!);
}

/** Switches the dino skin once all its sheets are built. */
export async function setSkin(next: Skin) {
  await Promise.all(BIOMES.map(biome => request(biome, next)));
  skin = next;
  listeners.forEach(listener => listener());
}

export function onSkinChange(listener: () => void) {
  listeners.push(listener);
}
