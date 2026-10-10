/**
 * Dino colours. New ones unlock as coins pile up over all runs.
 */

import {readNumber, writeNumber} from '../host.js';

import type {SpritePalette} from './biomes.js';

export type SkinId = 'green'|'classic'|'coral'|'ice'|'violet'|'gold';

export interface Skin {
  id: SkinId;
  name: string;
  // Coins collected over all runs needed to unlock it.
  price: number;
  palette: SpritePalette;
}

export const SKINS: Skin[] = [
  {
    id: 'green',
    name: 'Зелёный',
    price: 0,
    palette: {
      base: '#5cbf4a',
      light: '#8fe06a',
      dark: '#3f9435',
      outline: '#1d4a1a',
    },
  },
  {
    id: 'classic',
    name: 'Хромовый',
    price: 0,
    palette: {
      base: '#6b6b6b',
      light: '#8c8c8c',
      dark: '#535353',
      outline: '#2b2b2b',
    },
  },
  {
    id: 'coral',
    name: 'Огненный',
    price: 100,
    palette: {
      base: '#ff7a4f',
      light: '#ffa77a',
      dark: '#d9532e',
      outline: '#6b2412',
    },
  },
  {
    id: 'ice',
    name: 'Ледяной',
    price: 250,
    palette: {
      base: '#4cc9e8',
      light: '#8ee6f7',
      dark: '#2aa0c4',
      outline: '#0f4a5e',
    },
  },
  {
    id: 'violet',
    name: 'Фиолетовый',
    price: 500,
    palette: {
      base: '#9b6bff',
      light: '#bf9cff',
      dark: '#7448d6',
      outline: '#33176b',
    },
  },
  {
    id: 'gold',
    name: 'Золотой',
    price: 1000,
    palette: {
      base: '#ffc93c',
      light: '#ffe58a',
      dark: '#e09a12',
      outline: '#6e4508',
    },
  },
];

const BANK_KEY = 'chrome-dino:coins-total';
const SKIN_KEY = 'chrome-dino:skin';

export function getCoinBank(): number {
  return readNumber(BANK_KEY);
}

export function addToCoinBank(coins: number): number {
  const total = getCoinBank() + coins;
  writeNumber(BANK_KEY, total);
  return total;
}

export function isUnlocked(skin: Skin): boolean {
  return getCoinBank() >= skin.price;
}

export function getSelectedSkin(): Skin {
  let id: string|null = null;
  try {
    id = localStorage.getItem(SKIN_KEY);
  } catch {
    // Fall back to the default skin.
  }
  const skin = SKINS.find(s => s.id === id);
  return skin && isUnlocked(skin) ? skin : SKINS[0]!;
}

export function saveSelectedSkin(skin: Skin) {
  try {
    localStorage.setItem(SKIN_KEY, skin.id);
  } catch {
    // Not remembered between visits.
  }
}
