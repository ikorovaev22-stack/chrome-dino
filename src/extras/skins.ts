/**
 * Dino colours, bought with coins. Coins add up over all runs.
 */

import {readNumber, writeNumber} from '../host.js';

import type {SpritePalette} from './biomes.js';
import type {Upgrade} from './upgrades.js';
import {nextPrice, setUpgradeLevel, upgradeLevel} from './upgrades.js';

export type SkinId = 'green'|'classic'|'coral'|'ice'|'violet'|'gold';

export interface Skin {
  id: SkinId;
  name: string;
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
    price: 150,
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
    price: 300,
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
const OWNED_KEY = 'chrome-dino:skins-owned';

export function getCoinBank(): number {
  return readNumber(BANK_KEY);
}

export function addToCoinBank(coins: number): number {
  const total = getCoinBank() + coins;
  writeNumber(BANK_KEY, total);
  return total;
}

function spend(price: number): boolean {
  const bank = getCoinBank();
  if (bank < price) {
    return false;
  }
  writeNumber(BANK_KEY, bank - price);
  return true;
}

function readOwned(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function isOwned(skin: Skin): boolean {
  return skin.price === 0 || readOwned().has(skin.id);
}

/** Buys a skin; returns false when there aren't enough coins. */
export function buySkin(skin: Skin): boolean {
  if (isOwned(skin)) {
    return true;
  }
  if (!spend(skin.price)) {
    return false;
  }
  const owned = readOwned();
  owned.add(skin.id);
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]));
  } catch {
    // Kept for this visit only.
  }
  return true;
}

/** Buys the next level of an upgrade; false when it's unaffordable or maxed. */
export function buyUpgrade(upgrade: Upgrade): boolean {
  const price = nextPrice(upgrade);
  if (price === null || !spend(price)) {
    return false;
  }
  setUpgradeLevel(upgrade.id, upgradeLevel(upgrade.id) + 1);
  return true;
}

export function getSelectedSkin(): Skin {
  let id: string|null = null;
  try {
    id = localStorage.getItem(SKIN_KEY);
  } catch {
    // Fall back to the default skin.
  }
  const skin = SKINS.find(s => s.id === id);
  return skin && isOwned(skin) ? skin : SKINS[0]!;
}

export function saveSelectedSkin(skin: Skin) {
  try {
    localStorage.setItem(SKIN_KEY, skin.id);
  } catch {
    // Not remembered between visits.
  }
}
