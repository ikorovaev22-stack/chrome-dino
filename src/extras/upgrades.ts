/**
 * Permanent upgrades bought with coins between runs.
 */

import {readNumber, writeNumber} from '../host.js';

export type UpgradeId = 'hearts'|'magnet'|'star'|'shield'|'luck';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  // What each level gives, shown in the shop.
  describe: (level: number) => string;
  prices: number[];
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'hearts',
    name: 'Запас сердец',
    describe: level => `Сердец в начале забега: ${3 + level}`,
    prices: [150, 400],
  },
  {
    id: 'magnet',
    name: 'Сильный магнит',
    describe: level => `Магнит действует ${10 + level * 4} с`,
    prices: [80, 200, 400],
  },
  {
    id: 'star',
    name: 'Яркая звезда',
    describe: level => `Звезда действует ${6 + level * 2} с`,
    prices: [100, 250, 450],
  },
  {
    id: 'shield',
    name: 'Щит на старте',
    describe: level => level ? 'Каждый забег начинается со щитом' :
                               'Начинать забег со щитом',
    prices: [300],
  },
  {
    id: 'luck',
    name: 'Удача',
    describe: level => level ?
        `Бонусы выпадают на ${level * 15}% чаще` :
        'Бонусы выпадают чаще',
    prices: [120, 300, 600],
  },
];

const key = (id: UpgradeId) => `chrome-dino:upgrade-${id}`;

export function upgradeLevel(id: UpgradeId): number {
  return readNumber(key(id));
}

export function maxLevel(upgrade: Upgrade): number {
  return upgrade.prices.length;
}

/** Price of the next level, or null when maxed out. */
export function nextPrice(upgrade: Upgrade): number|null {
  return upgrade.prices[upgradeLevel(upgrade.id)] ?? null;
}

export function setUpgradeLevel(id: UpgradeId, level: number) {
  writeNumber(key(id), level);
}
