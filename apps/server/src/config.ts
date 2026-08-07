import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BalanceConfig, CityConfig, RouteConfig } from '@timewar/shared';

const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

export interface GameData {
  balance: BalanceConfig;
  cities: CityConfig[];
  routes: RouteConfig[];
}

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(`${DATA_DIR}/${name}.json`, 'utf-8')) as T;
}

let cached: GameData | null = null;

export function loadGameData(): GameData {
  if (cached) return cached;
  const balance = loadJson<BalanceConfig>('game-balance');
  balance.provinceDistances = loadJson<Record<string, number>>('province-distances');
  cached = {
    balance,
    cities: loadJson<CityConfig[]>('cities'),
    routes: loadJson<RouteConfig[]>('routes'),
  };
  return cached;
}
