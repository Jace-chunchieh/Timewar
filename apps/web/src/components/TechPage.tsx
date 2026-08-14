import { useState } from 'react';
import type { TechKey } from '@timewar/shared';
import { api } from '../api';
import { fmt, fmtPct } from '../lib/format';
import { balance, itemProbabilityClient, techCostClient } from '../lib/game';
import { TECH_DEFS } from '../lib/tech';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, NumInput, ProgressBar } from './ui';

export default function TechPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const [workers, setWorkers] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!display) return null;
  const idle = display.resources.idlePopulation;
  const current = display.tech.researchWorkers;
  const maxWorkers = current + idle;

  const apply = async () => {
    setBusy(true);
    await mutate(() => api.researchAllocate(workers));
    setBusy(false);
  };

  const upgrade = async (key: TechKey) => {
    setBusy(true);
    await mutate(() => api.techUpgrade(key));
    setBusy(false);
  };

  const items = [
    {
      key: 'talisman' as const,
      name: '神行符',
      desc: '出征突破接壤（按省距消耗 1~N 张）',
      count: display.tech.talismans,
      probability: itemProbabilityClient(display, 'talisman'),
      baseline: balance.talisman.researchBaseline,
      per100: balance.talisman.probabilityPer100Workers,
    },
    {
      key: 'banner' as const,
      name: '军团旗',
      desc: '组建永久军团（1 面/军团）',
      count: display.tech.bannerFlags ?? 0,
      probability: itemProbabilityClient(display, 'banner'),
      baseline: balance.banner.researchBaseline,
      per100: balance.banner.probabilityPer100Workers,
    },
    {
      key: 'speedup' as const,
      name: '加速符',
      desc: `训练/行军时间 -${balance.speedup.secondsPerUse / 3600} 小时`,
      count: display.tech.speedUps ?? 0,
      probability: itemProbabilityClient(display, 'speedup'),
      baseline: balance.speedup.researchBaseline,
      per100: balance.speedup.probabilityPer100Workers,
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-gold2">科技研发</h2>

        <Card title="科研院 · 奇物产出">
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            {items.map((it) => (
              <div key={it.key} className="bg-panel2/60 rounded p-2">
                <div className="text-muted">{it.name}库存</div>
                <div className="text-base font-semibold text-gold tabular">{fmt(it.count)}</div>
              </div>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
            {items.map((it) => (
              <div key={it.key} className="bg-panel2/60 rounded p-2">
                <div className="text-gold">{it.name}</div>
                <div className="text-muted mt-0.5">{it.desc}</div>
                <div className="text-text tabular mt-1">概率/10秒 {fmtPct(it.probability)}</div>
              </div>
            ))}
          </div>
          <ProgressBar value={Math.min(1, current / balance.banner.researchBaseline)} max={1} color={current >= balance.banner.researchBaseline ? 'bg-gold' : 'bg-orange'} className="mb-1" />
          <div className="text-xs text-muted mb-2">
            基准：神行符 {fmt(balance.talisman.researchBaseline)} 人 · 军团旗 {fmt(balance.banner.researchBaseline)} 人 · 加速符 {fmt(balance.speedup.researchBaseline)} 人。
            达到各自基准后按概率产出（无保底）。当前投入 {fmt(current)} 人。
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <NumInput value={workers} onChange={setWorkers} max={maxWorkers} step={100} ariaLabel="科研研究员" />
            </div>
            <Btn onClick={() => setWorkers(maxWorkers)} variant="ghost">最大</Btn>
            <Btn onClick={apply} disabled={busy} className="!px-5">应用</Btn>
          </div>
          <div className="text-[11px] text-muted mt-2">
            提示：神行符可在出征时消耗，突破接壤限制攻打任意省份城市（接壤省 1 张，隔 1 省 2 张，以此类推）。
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-3">
          {TECH_DEFS.map(({ key, label, desc, effectPerLevel }) => {
            const level = display.tech.levels[key] ?? 0;
            const maxLevel = balance.tech.maxLevel;
            const maxed = level >= maxLevel;
            const cost = maxed ? 0 : techCostClient(level + 1);
            const affordable = cost <= idle;
            return (
              <Card key={key} title={`${label} Lv.${level}/${maxLevel}`}>
                <div className="text-xs text-muted mb-1.5">{desc}</div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted">当前加成</span>
                  <span className="text-gold tabular">{fmtPct(effectPerLevel * level)}</span>
                </div>
                <ProgressBar value={level} max={maxLevel} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted">
                    {maxed ? '已达最高等级' : `升级消耗：${fmt(cost)} 人口（一次性）`}
                  </span>
                  <Btn
                    disabled={busy || maxed || !affordable}
                    onClick={() => upgrade(key)}
                    className="!py-1 text-xs"
                  >
                    升级
                  </Btn>
                </div>
                {!maxed && !affordable && (
                  <div className="text-danger text-[11px] mt-1">人口不足（当前空闲 {fmt(idle)}）</div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
