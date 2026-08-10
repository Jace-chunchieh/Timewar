import { useState } from 'react';
import { fmt, fmtPct, fmtTime } from '../lib/format';
import { cityName } from '../lib/game';
import { useDisplay } from '../hooks';
import { Card } from './ui';

export default function ReportsPage() {
  const display = useDisplay();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!display) return null;
  const reports = display.battleReports;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-bold text-gold2 mb-3">战报</h2>
        {reports.length === 0 && (
          <div className="text-sm text-muted py-8 text-center">暂无战报。对相邻敌方城市发起进攻后，这里会展示详细战报与计算明细。</div>
        )}
        <div className="space-y-2">
          {reports.map((r) => {
            const open = openId === r.id;
            return (
              <Card key={r.id} className="cursor-pointer" title={
                <span className={r.victory ? 'text-gold2' : 'text-danger'}>
                  {r.victory ? '胜利' : '失败'} · 进攻 {cityName(r.targetCityId)}
                </span>
              }
              right={<span className="text-xs text-muted tabular">{fmtTime(r.time)}</span>}
              >
                <button className="w-full text-left" onClick={() => setOpenId(open ? null : r.id)}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>出发 {cityName(r.originCityId)}</span>
                    <span>兵力 {fmt(r.attackerInfantry + r.attackerCavalry)}</span>
                    <span className={r.victory ? 'text-gold' : 'text-danger'}>
                      伤亡 {fmt(r.attackerCasualtiesInfantry + r.attackerCasualtiesCavalry)}
                    </span>
                    <span>敌伤亡 {fmt(r.defenderCasualties)}</span>
                    {r.captured && <span className="text-gold2">已占领</span>}
                    <span className="text-muted">{open ? '收起明细 ▲' : '展开明细 ▼'}</span>
                  </div>
                </button>
                {open && (
                  <div className="mt-2 bg-panel2/70 rounded p-3 text-xs space-y-1.5 rise-in">
                    <div className="text-gold2 font-semibold mb-1">计算明细</div>
                    {r.defenderGeneralName && (
                      <div className="flex justify-between"><span className="text-muted">敌方守将</span><span className="text-orange">{r.defenderGeneralName}</span></div>
                    )}
                    {r.victory && r.defenderGeneralName && (
                      <div className="flex justify-between">
                        <span className="text-muted">守将去向</span>
                        <span className={r.recruitedGeneralName ? 'text-gold2' : 'text-muted'}>
                          {r.recruitedGeneralName ? `已招募 ${r.recruitedGeneralName} 为我方将领` : '逃散（招募失败）'}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-muted">进攻战力</span><span className="tabular">{fmt(r.attackerPower)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">防守战力</span><span className="tabular">{fmt(r.defenderPower)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">将领等级</span><span className="tabular">Lv.{r.generalLevel}（加成 +{fmtPct(r.generalLevel * 0.02)}）</span></div>
                    <div className="flex justify-between"><span className="text-muted">城防加成</span><span className="tabular">+{fmtPct(r.cityDefenseBonus)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">战斗波动</span><span className="tabular">×{r.variance.toFixed(3)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">敌方守军</span><span className="tabular">{fmt(r.defenderGarrison)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">我方步兵伤亡</span><span className="tabular">{fmt(r.attackerCasualtiesInfantry)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">我方骑兵伤亡</span><span className="tabular">{fmt(r.attackerCasualtiesCavalry)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">装备回收</span><span className="tabular">武器 {fmt(r.recoveredWeapons)} · 盔甲 {fmt(r.recoveredArmors)} · 战马 {fmt(r.recoveredHorses)}</span></div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
