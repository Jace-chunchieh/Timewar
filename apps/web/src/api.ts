import type { GameState } from '@timewar/shared';

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
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
  state: () => request<{ state: GameState }>('/api/game/state'),
  newGame: () => request<{ state: GameState }>('/api/game/new', {}),
  reset: () => request<{ state: GameState }>('/api/game/reset', {}),
  setTutorialStep: (step: number) => request<{ state: GameState }>('/api/tutorial/step', { step }),
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
    generalId: string;
    infantry: number;
    cavalry: number;
    targetCityId?: string;
    useTalisman?: boolean;
  }) => request<{ state: GameState }>('/api/armies/create', input),
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
  }) => request<{ state: GameState }>('/api/armies/transfer', input),
  researchAllocate: (workers: number) =>
    request<{ state: GameState }>('/api/research/allocate', { workers }),
  techUpgrade: (key: string) => request<{ state: GameState }>('/api/tech/upgrade', { key }),
};
