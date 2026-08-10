import { useState } from 'react';
import { api } from '../api';
import { fmt, fmtDur } from '../lib/format';
import { balance, cityName } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, NumInput, ProgressBar } from './ui';

export default function TrainingPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const [count, setCount] = useState(100);
  const [busy, setBusy] = useState(false);

  if (!display) return null;
  const active = display.trainingBatches.reduce((s, b) => s + b.count, 0);
  const idle = display.resources.idlePopulation;
  const durationMs = (balance.trainingDurationSeconds + Math.max(0, count - 1) * balance.trainingTimePerPersonExtra) * 1000;
  const now = Date.now();

  const start = async () => {
    if (count <= 0) return;
    setBusy(true);
    await mutate(() => api.trainingStart(count));
    setBusy(false);
  };

  const cancelBatch = async (batchId: string) => {
    setBusy(true);
    await mutate(() => api.trainingCancel(batchId));
    setBusy(false);
  };

  const recentGenerals = display.generals.filter((g) => g.id !== 'g-initial').slice(-6).reverse();

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-gold2">人口训练</h2>

        <Card title={`新建训练批次 · 训练中 ${fmt(active)} 人`}>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-panel2/60 rounded p-2">
                <div className="text-muted">当前批次耗时</div>
                <div className="text-base font-semibold text-text tabular">{fmtDur(durationMs)}</div>
              </div>
              <div className="bg-panel2/60 rounded p-2">
                <div className="text-muted">训练后人口库存</div>
                <div className="text-base font-semibold text-gold tabular">{fmt(display.resources.trainedPopulation)}</div>
              </div>
            </div>
            <NumInput value={count} onChange={setCount} max={idle} step={10} ariaLabel="训练人数" />
            <div className="flex gap-2">
              {[100, 500, 1000, 5000].map((n) => (
                <Btn key={n} variant="ghost" onClick={() => setCount(Math.min(n, idle))} className="!py-1 text-xs">
                  {n}
                </Btn>
              ))}
            </div>
            <div className="bg-panel2/70 rounded p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted">训练人数</span><span className="text-text tabular">{fmt(count)}</span></div>
              <div className="flex justify-between"><span className="text-muted">预计完成</span><span className="text-text tabular">{fmtDur(durationMs)}后</span></div>
              <div className="flex justify-between"><span className="text-muted">期望将领数量</span><span className="text-gold tabular">≈{((count * balance.generalProbability)).toFixed(2)} 名</span></div>
              <div className="text-xs text-muted">
                本批训练 {fmt(count)} 人，期望将领数量约为 {((count * balance.generalProbability)).toFixed(2)}，但不保证产生将领（概率 1/10,000）。
                训练无人数上限，批次越大耗时越长（每 100 人约增加 1 分钟）。
              </div>
            </div>
            <Btn onClick={start} disabled={busy || count <= 0 || count > idle} className="w-full py-2">
              {busy ? '提交中…' : '开始训练'}
            </Btn>
            {count > idle && <div className="text-danger text-xs">空闲人口不足（需求 {fmt(count)}，现有 {fmt(idle)}）</div>}
          </div>
        </Card>

        <Card title={`训练中批次（${display.trainingBatches.length}）`}>
          {display.trainingBatches.length === 0 && (
            <div className="text-xs text-muted py-2">暂无训练中的批次。训练完成后 99.99% 人口进入训练后人口，万分之一的概率诞生将领。</div>
          )}
          <div className="space-y-2">
            {display.trainingBatches.map((b) => {
              const start = Date.parse(b.startedAt);
              const end = Date.parse(b.completesAt);
              const pct = Math.min(1, Math.max(0, (now - start) / (end - start)));
              return (
                <div key={b.id} className="bg-panel2/60 rounded p-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text">批次 · {fmt(b.count)} 人</span>
                    <span className="text-muted tabular">{fmtDur(Math.max(0, end - now))}</span>
                  </div>
                  <ProgressBar value={pct} max={1} />
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-xs text-muted">完成后返回 50% 人口（取消惩罚）</span>
                    <Btn variant="danger" onClick={() => cancelBatch(b.id)} disabled={busy} className="!py-0.5 !px-2 text-xs">
                      取消
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="最近诞生的将领">
          {recentGenerals.length === 0 ? (
            <div className="text-xs text-muted py-2">暂无。每名完成训练的人口有 1/10,000 概率成为将领（无保底）。</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentGenerals.map((g) => (
                <span key={g.id} className="bg-panel2/70 rounded px-2 py-1 text-xs text-gold">
                  {g.name} Lv.{g.level}
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="text-xs text-muted pb-4">
          提示：合成士兵需要 训练后人口 + 武器 + 盔甲（骑兵另需战马）。训练无人数上限，批次耗时 = 10 分钟基础 + 每人 0.6 秒（100 人约 11 分钟、1000 人约 20 分钟）。
        </div>
      </div>
    </div>
  );
}
