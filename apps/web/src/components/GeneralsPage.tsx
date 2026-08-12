import { api } from '../api';
import { fmt, fmtDur } from '../lib/format';
import { cityName, commandCapClient, xpNeededClient } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, ProgressBar } from './ui';

export default function GeneralsPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  if (!display) return null;
  const now = Date.now();

  const start = (id: string) => mutate(() => api.generalStartTraining(id));
  const stop = (id: string) => mutate(() => api.generalStopTraining(id));
  const dismiss = (id: string) => mutate(() => api.generalDismissGarrison(id));

  const statusText: Record<string, string> = {
    IDLE: '空闲',
    TRAINING: '训练中',
    MARCHING: '行军中',
    GARRISON: '驻守中',
    BATTLE: '战斗中',
  };
  const statusColor: Record<string, string> = {
    IDLE: 'text-muted border-line',
    TRAINING: 'text-gold border-gold/50',
    MARCHING: 'text-orange border-orange/50',
    GARRISON: 'text-gold2 border-gold/70',
    BATTLE: 'text-danger border-danger/60',
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-bold text-gold2 mb-3">将领</h2>
        {display.generals.length === 0 && <div className="text-muted text-sm">暂无将领</div>}
        <div className="grid md:grid-cols-2 gap-3">
          {display.generals.map((g) => {
            const cap = commandCapClient(g.level, display);
            const need = xpNeededClient(g.level);
            const xpProgress = Math.min(1, g.xp / need);
            const etaSec = g.status === 'TRAINING' ? (need - g.xp) / 1 : 0;
            const city = g.cityId ? display.cities.find((c) => c.cityId === g.cityId) : undefined;
            return (
              <Card key={g.id} title={`${g.name} · Lv.${g.level}`} right={<span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[g.status]}`}>{statusText[g.status]}</span>}>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-muted mb-1">
                      <span>经验 {fmt(g.xp)} / {fmt(need)}</span>
                      <span>{Math.floor(xpProgress * 100)}%</span>
                    </div>
                    <ProgressBar value={g.xp} max={need} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">统帅上限</span>
                    <span className="text-text tabular">{fmt(cap)} 人</span>
                  </div>
                  {g.status === 'TRAINING' && (
                    <div className="text-gold tabular">
                      升级预计还需 {fmtDur(Math.max(0, etaSec * 1000))}（随时可停止，经验保留）
                      {g.cityId && <span className="text-muted"> · 驻守于 {cityName(g.cityId)} 训练中</span>}
                    </div>
                  )}
                  {g.status === 'GARRISON' && city && (
                    <div className="text-muted">驻守于 {cityName(city.cityId)}（步兵 {fmt(city.infantry)} · 骑兵 {fmt(city.cavalry)}）</div>
                  )}
                  {g.status === 'MARCHING' && (
                    <div className="text-orange">行军途中</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    {(g.status === 'IDLE' || g.status === 'GARRISON') && (
                      <Btn onClick={() => start(g.id)} className="flex-1">开始训练</Btn>
                    )}
                    {g.status === 'TRAINING' && (
                      <Btn variant="orange" onClick={() => stop(g.id)} className="flex-1">停止训练</Btn>
                    )}
                    {g.status === 'GARRISON' && (
                      <Btn variant="ghost" onClick={() => dismiss(g.id)} className="flex-1">调回空闲</Btn>
                    )}
                    {g.status !== 'IDLE' && g.status !== 'TRAINING' && g.status !== 'GARRISON' && (
                      <div className="flex-1 text-center text-muted py-1.5">任务进行中，无法操作</div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="text-xs text-muted mt-3 pb-4">
          将领每训练 1 秒获得 1 点经验；升级所需经验 = 300 × 当前等级²；统帅上限 = 200 + (等级-1) × 100；战力加成 = 1 + 等级 × 0.02。
        </div>
      </div>
    </div>
  );
}
