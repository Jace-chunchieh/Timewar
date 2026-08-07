import { useState } from 'react';
import type { GameState } from '@timewar/shared';
import { api } from '../api';
import { fmt, fmtDur } from '../lib/format';
import { balance } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, NumInput, ProgressBar } from './ui';

interface LineDraft {
  workers: number;
  line: keyof GameState['production'];
  resKey: 'weapons' | 'armors' | 'horses';
  work: number;
  name: string;
}

const LINES: LineDraft[] = [
  { workers: 0, line: 'weapon', resKey: 'weapons', work: balance.productionWork.weapon, name: '武器制造' },
  { workers: 0, line: 'armor', resKey: 'armors', work: balance.productionWork.armor, name: '盔甲制造' },
  { workers: 0, line: 'horse', resKey: 'horses', work: balance.productionWork.horse, name: '战马饲养' },
];

export default function ProductionPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const [draft, setDraft] = useState<Record<string, number>>({ weapon: 0, armor: 0, horse: 0 });
  const [busy, setBusy] = useState(false);

  if (!display) return null;
  const idle = display.resources.idlePopulation;
  const current = {
    weapon: display.production.weapon.workers,
    armor: display.production.armor.workers,
    horse: display.production.horse.workers,
  };
  const currentTotal = current.weapon + current.armor + current.horse;
  const draftTotal = draft.weapon + draft.armor + draft.horse;
  const valid = draftTotal <= currentTotal + idle;

  const setLine = (line: string, v: number) => setDraft((d) => ({ ...d, [line]: Math.max(0, v) }));
  const apply = async () => {
    setBusy(true);
    await mutate(() => api.allocate({ weapon: draft.weapon, armor: draft.armor, horse: draft.horse }));
    setBusy(false);
  };
  const withdrawAll = async () => {
    setBusy(true);
    await mutate(() => api.allocate({ weapon: 0, armor: 0, horse: 0 }));
    setDraft({ weapon: 0, armor: 0, horse: 0 });
    setBusy(false);
  };

  const afterIdle = idle + currentTotal - draftTotal;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold2">人口与生产</h2>
          <div className="text-sm text-muted">
            空闲人口 <span className="text-text font-semibold tabular">{fmt(afterIdle)}</span>
          </div>
        </div>

        {LINES.map((cfg) => {
          const lineState = display.production[cfg.line];
          const currentWorkers = lineState.workers;
          const draftWorkers = draft[cfg.line];
          const perMin = Math.floor(draftWorkers * 60 / cfg.work);
          const remaining = Math.max(0, cfg.work - lineState.progress);
          const etaSec = draftWorkers > 0 ? remaining / draftWorkers : 0;
          return (
            <Card key={cfg.line} title={cfg.name} className={currentWorkers > 0 ? 'border-gold/40' : ''}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
                <div className="bg-panel2/60 rounded p-2">
                  <div className="text-muted">分配人口</div>
                  <div className="text-base font-semibold text-gold tabular">{fmt(draftWorkers)}</div>
                </div>
                <div className="bg-panel2/60 rounded p-2">
                  <div className="text-muted">预计产量</div>
                  <div className="text-base font-semibold text-text tabular">{perMin}/分钟</div>
                </div>
                <div className="bg-panel2/60 rounded p-2">
                  <div className="text-muted">下一件</div>
                  <div className="text-base font-semibold text-text tabular">{draftWorkers > 0 ? fmtDur(etaSec * 1000) : '—'}</div>
                </div>
                <div className="bg-panel2/60 rounded p-2">
                  <div className="text-muted">库存</div>
                  <div className="text-base font-semibold text-text tabular">{fmt(display.resources[cfg.resKey])}</div>
                </div>
              </div>
              <div className="mb-1 flex justify-between text-xs text-muted tabular">
                <span>进度 {Math.floor(lineState.progress)} / {cfg.work}</span>
                <span>{fmtPct2(lineState.progress / cfg.work)}</span>
              </div>
              <ProgressBar value={lineState.progress} max={cfg.work} />
              <div className="mt-3 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={idle + currentTotal}
                  value={draftWorkers}
                  onChange={(e) => setLine(cfg.line, Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex items-center gap-2">
                  <NumInput value={draftWorkers} onChange={(v) => setLine(cfg.line, v)} max={idle + currentTotal} step={10} ariaLabel={`${cfg.name}分配人口`} />
                  <div className="flex gap-1 ml-auto">
                    {[0.25, 0.5, 1].map((r) => (
                      <Btn key={r} variant="ghost" onClick={() => setLine(cfg.line, Math.floor((idle + currentTotal) * r))} className="!py-0.5 !px-2 text-xs">
                        {r === 1 ? '最大' : `${r * 100}%`}
                      </Btn>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted">调整后：空闲 {fmt(afterIdle)} · {cfg.name} {fmt(draftWorkers)}人 · 每分钟 {perMin} 件</div>
              </div>
            </Card>
          );
        })}

        <div className="flex gap-2 sticky bottom-0 bg-bg/95 py-2">
          <Btn onClick={apply} disabled={!valid || busy} className="flex-1 py-2">
            {busy ? '提交中…' : '应用分配'}
          </Btn>
          <Btn variant="ghost" onClick={withdrawAll} disabled={busy}>
            全部撤回
          </Btn>
        </div>
        {!valid && (
          <div className="text-danger text-xs">分配人口超出空闲人口，无法提交（需求 {draftTotal}，可用 {currentTotal + idle}）</div>
        )}
      </div>
    </div>
  );
}

function fmtPct2(p: number): string {
  return `${Math.min(100, Math.floor(p * 100))}%`;
}
