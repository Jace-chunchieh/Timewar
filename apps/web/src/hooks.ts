import { useMemo } from 'react';
import type { GameState } from '@timewar/shared';
import { previewAdvance } from './lib/game';
import { useGame } from './store';

export function useDisplay(): GameState | null {
  const state = useGame((s) => s.state);
  const tick = useGame((s) => s.tick);
  return useMemo(() => (state ? previewAdvance(state, Date.now()) : null), [state, tick]);
}
