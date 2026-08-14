import type { GameState } from '@timewar/shared';

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const getCode = () => localStorage.getItem('timewar-code') ?? '';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const code = getCode();
  if (code) headers['x-auth-code'] = code;
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json ?? {}) as { code?: string; message?: string };
    throw new ApiError(err.code ?? 'HTTP_ERROR', err.message ?? `请求失败 (${res.status})`);
  }
  return json as T;
}

export const api = {
  login: (code: string) =>
    request<{ auth: { code: string; name: string; isAdmin: boolean } }>('/api/auth/login', { code }),
  bindEmail: (email: string) =>
    request<{ auth: { code: string; email: string } }>('/api/auth/bind-email', { email }),
  sendBannerGift: () => request<{ sent: { giftCode: string } }>('/api/auth/send-banner-gift', {}),
  claimBannerGift: (code: string) =>
    request<{ state: GameState }>('/api/auth/claim-banner-gift', { code }),
  addCode: (code: string, name: string) =>
    request<{ auth: { code: string; name: string; isAdmin: boolean } }>('/api/auth/add-code', { code, name }),
  listCodes: () =>
    request<{ codes: { code: string; name: string; isAdmin: boolean }[] }>('/api/auth/list'),
  state: () => request<{ state: GameState }>('/api/game/state'),
  newGame: () => request<{ state: GameState }>('/api/game/new', {}),
  reset: () => request<{ state: GameState }>('/api/game/reset', {}),
  setTutorialStep: (step: number) => request<{ state: GameState }>('/api/tutorial/step', { step }),
  ackWelcome: () => request<{ state: GameState }>('/api/game/welcome-ack', {}),
  allocate: (workers: { weapon: number; armor: number; horse: number }) =>
    request<{ state: GameState }>('/api/production/allocate', { workers }),
  trainingStart: (count: number) => request<{ state: GameState }>('/api/training/start', { count }),
  trainingCancel: (batchId: string) => request<{ state: GameState }>('/api/training/cancel', { batchId }),
  craft: (infantry: number, cavalry: number) =>
    request<{ state: GameState }>('/api/soldiers/craft', { infantry, cavalry }),
  generalStartTraining: (generalId: string) =>
    request<{ state: GameState }>('/api/generals/start-training', { generalId }),
  generalStopTraining: (generalId: string) =>
    request<{ state: GameState }>('/api/generals/stop-training', { generalId }),
  generalDismissGarrison: (generalId: string) =>
    request<{ state: GameState }>('/api/generals/dismiss-garrison', { generalId }),
  armyCreate: (input: {
    originCityId: string;
    name: string;
    bannerGeneralId: string;
    memberGeneralIds: string[];
    strategy?: 'NORMAL' | 'DEFENSIVE' | 'CHARGE';
    infantry: number;
    cavalry: number;
  }) => request<{ state: GameState }>('/api/armies/create', input),
  soloAttack: (input: {
    generalId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    useTalisman?: boolean;
  }) => request<{ state: GameState }>('/api/armies/solo-attack', input),
  armyAddGeneral: (armyId: string, generalId: string) => request<{ state: GameState }>('/api/armies/add-general', { armyId, generalId }),
  armyRemoveGeneral: (armyId: string, generalId: string) => request<{ state: GameState }>('/api/armies/remove-general', { armyId, generalId }),
  armyReinforce: (armyId: string, infantry: number, cavalry: number) => request<{ state: GameState }>('/api/armies/reinforce', { armyId, infantry, cavalry }),
  useSpeedup: (targetType: 'training' | 'army', targetId: string) => request<{ state: GameState }>('/api/items/use-speedup', { targetType, targetId }),
  batchTraining: (action: 'start' | 'stop') => request<{ state: GameState }>('/api/generals/batch-training', { action }),
  moveCapital: (cityId: string) =>
    request<{ state: GameState }>('/api/city/move-capital', { cityId }),
  barbarianAttack: (input: {
    campId: string;
    bannerGeneralId: string;
    memberGeneralIds: string[];
    strategy?: 'NORMAL' | 'DEFENSIVE' | 'CHARGE';
    infantry: number;
    cavalry: number;
  }) => request<{ state: GameState }>('/api/barbarians/attack', input),
  armyMarch: (armyId: string, targetCityId: string, useTalisman?: boolean) =>
    request<{ state: GameState }>('/api/armies/march', { armyId, targetCityId, useTalisman }),
  armyCancelMarch: (armyId: string) =>
    request<{ state: GameState }>('/api/armies/cancel-march', { armyId }),
  armyTransfer: (input: {
    originCityId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    generalId?: string;
    useTalisman?: boolean;
  }) => request<{ state: GameState }>('/api/armies/transfer', input),
  garrisonAttack: (input: {
    garrisonCityId: string;
    generalId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    useTalisman?: boolean;
  }) => request<{ state: GameState }>('/api/armies/garrison-attack', input),
  researchAllocate: (workers: number) =>
    request<{ state: GameState }>('/api/research/allocate', { workers }),
  techUpgrade: (key: string) => request<{ state: GameState }>('/api/tech/upgrade', { key }),
};
