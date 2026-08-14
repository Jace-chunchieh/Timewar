import { create } from 'zustand';
import type { GameState } from '@timewar/shared';
import { api, ApiError } from './api';
import { balance, cityName } from './lib/game';

export type View =
  | 'map'
  | 'production'
  | 'training'
  | 'craft'
  | 'tech'
  | 'generals'
  | 'armies'
  | 'garrison'
  | 'reports'
  | 'settings';

const TECH_LABELS: Record<string, string> = {
  siege: '攻城术',
  logistics: '军驿',
  smithing: '冶炼',
  agronomy: '军屯',
  discipline: '治军',
  command: '统帅之道',
  talismanMastery: '神行符强化',
};

export interface LogEvent {
  id: string;
  time: number;
  text: string;
  kind: 'battle' | 'capture' | 'general' | 'info' | 'offline' | 'error';
}

interface Snapshot {
  cities: number;
  generals: number;
  reports: number;
  trained: number;
}

interface StoreState {
  state: GameState | null;
  loading: boolean;
  error: string | null;
  authed: boolean;
  authName: string | null;
  isAdmin: boolean;
  view: View;
  selectedCityId: string | null;
  mapLevel: 'national' | 'province';
  currentProvinceId: string | null;
  tick: number;
  events: LogEvent[];
  offlineSeenId: string | null;
  lastSnapshot: Snapshot | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
  login: (code: string) => Promise<boolean>;
  logout: () => void;
  setView: (v: View) => void;
  selectCity: (id: string | null) => void;
  enterProvince: (provinceId: string | null) => void;
  pushEvent: (text: string, kind?: LogEvent['kind']) => void;
  dismissOffline: () => void;
}

let eventSeq = 0;

export const useGame = create<StoreState>((set, get) => ({
  state: null,
  loading: true,
  error: null,
  authed: !!localStorage.getItem('timewar-code'),
  authName: null,
  isAdmin: false,
  view: 'map',
  selectedCityId: null,
  mapLevel: 'national',
  currentProvinceId: null,
  tick: 0,
  events: [],
  offlineSeenId: localStorage.getItem('timewar-offline-seen'),
  lastSnapshot: null,

  init: async () => {
    if (!localStorage.getItem('timewar-code')) {
      set({ loading: false, authed: false });
      return;
    }
    try {
      // 刷新后恢复授权信息（登录接口放行，可校验 code 有效性）
      const { auth } = await api.login(localStorage.getItem('timewar-code')!);
      set({ authed: true, authName: auth.name, isAdmin: auth.isAdmin });
      const { state } = await api.state();
      set({ state, loading: false });
      get().refresh();
    } catch (e) {
      if ((e as ApiError).code === 'AUTH_REQUIRED' || (e as ApiError).code === 'AUTH_INVALID') {
        localStorage.removeItem('timewar-code');
        set({ loading: false, authed: false });
      } else {
        set({ loading: false, error: (e as Error).message });
      }
    }
  },

  refresh: async () => {
    try {
      const { state } = await api.state();
      const prev = get().state;
      const lastSnapshot = get().lastSnapshot;
      const newEvents: LogEvent[] = [];
      if (prev) {
        // 战报
        for (let i = state.battleReports.length - 1; i >= prev.battleReports.length; i--) {
          const r = state.battleReports[i];
          if (!r) break;
          const target = cityName(r.targetCityId);
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: r.victory ? `攻占 ${target}（胜利，伤亡 ${r.attackerCasualtiesInfantry + r.attackerCasualtiesCavalry}）` : `进攻 ${target} 失败（伤亡 ${r.attackerCasualtiesInfantry + r.attackerCasualtiesCavalry}）`,
            kind: r.victory ? 'capture' : 'battle',
          });
        }
        // 新将领
        if (state.generals.length > prev.generals.length) {
          const names = state.generals.slice(prev.generals.length).map((g) => g.name);
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: `训练完成，诞生新将领：${names.join('、')}`,
            kind: 'general',
          });
        }
        // 离线报告
        if (state.offlineReport && state.offlineReport.id !== get().offlineSeenId) {
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: `离线 ${Math.round(state.offlineReport.offlineMs / 60000)} 分钟收益已结算`,
            kind: 'offline',
          });
        }
        // 训练完成
        if (state.resources.trainedPopulation > prev.resources.trainedPopulation) {
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: `完成 ${state.resources.trainedPopulation - prev.resources.trainedPopulation} 名训练后人口`,
            kind: 'info',
          });
        }
        // 神行符
        if (state.tech.talismans > prev.tech.talismans) {
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: `科研院产出神行符 ×${state.tech.talismans - prev.tech.talismans}`,
            kind: 'general',
          });
        }
        // A市 升级
        const acityNow = state.cities.find((c) => c.cityId === 'acity');
        const acityPrev = prev.cities.find((c) => c.cityId === 'acity');
        if (acityNow && acityPrev && acityNow.level > acityPrev.level) {
          newEvents.push({
            id: `e-${++eventSeq}`,
            time: Date.now(),
            text: `A市 升至 Lv.${acityNow.level}（人口 +${balance.populationPerCityPerInterval[String(acityNow.level)] ?? 1}/10秒）`,
            kind: 'offline',
          });
        }
        // 科技升级
        for (const key of ['siege', 'logistics', 'smithing', 'agronomy', 'discipline', 'command', 'talismanMastery'] as const) {
          const lvNow = state.tech.levels[key] ?? 0;
          const lvPrev = prev.tech.levels[key] ?? 0;
          if (lvNow > lvPrev) {
            newEvents.push({
              id: `e-${++eventSeq}`,
              time: Date.now(),
              text: `科技升级：${TECH_LABELS[key]} Lv.${lvNow}`,
              kind: 'info',
            });
          }
        }
      }
      const snap: Snapshot = {
        cities: state.cities.length,
        generals: state.generals.length,
        reports: state.battleReports.length,
        trained: state.resources.trainedPopulation,
      };
      set((s) => ({
        state,
        lastSnapshot: snap,
        events: lastSnapshot ? [...newEvents.reverse(), ...s.events].slice(0, 24) : s.events,
        error: null,
      }));
    } catch (e) {
      if ((e as ApiError).code === 'AUTH_REQUIRED') {
        localStorage.removeItem('timewar-code');
        set({ authed: false, state: null });
        return;
      }
      const msg = (e as Error).message;
      set({ error: msg });
      setTimeout(() => set({ error: null }), 4000);
    }
  },

  mutate: async (fn) => {
    try {
      await fn();
      await get().refresh();
      return true;
    } catch (e) {
      if ((e as ApiError).code === 'AUTH_REQUIRED') {
        localStorage.removeItem('timewar-code');
        set({ authed: false, state: null });
        return false;
      }
      const msg = (e as Error).message;
      set({ error: msg });
      setTimeout(() => set({ error: null }), 4000);
      return false;
    }
  },

  login: async (code) => {
    try {
      const { auth } = await api.login(code);
      localStorage.setItem('timewar-code', auth.code);
      set({ authed: true, authName: auth.name, isAdmin: auth.isAdmin, error: null });
      await get().init();
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg });
      setTimeout(() => set({ error: null }), 4000);
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('timewar-code');
    set({ authed: false, state: null, authName: null, isAdmin: false });
  },

  setView: (v) => set({ view: v }),
  selectCity: (id) => set({ selectedCityId: id }),
  enterProvince: (provinceId) =>
    set((s) => ({
      mapLevel: provinceId ? 'province' : 'national',
      currentProvinceId: provinceId,
      selectedCityId: null,
    })),
  pushEvent: (text, kind = 'info') =>
    set((s) => ({ events: [{ id: `e-${++eventSeq}`, time: Date.now(), text, kind }, ...s.events].slice(0, 24) })),
  dismissOffline: () => {
    const id = get().state?.offlineReport?.id;
    if (id) localStorage.setItem('timewar-offline-seen', id);
    set({ offlineSeenId: id ?? null });
  },
}));
