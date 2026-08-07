import { useState } from 'react';
import { api } from '../api';
import { fmt } from '../lib/format';
import { balance } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, NumInput } from './ui';

interface FloatText {
  id: number;
  text: string;
}

export default function CraftPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const [infantry, setInfantry] = useState(0);
  const [cavalry, setCavalry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [floats, setFloats] = useState<FloatText[]>([]);

  if (!display) return null;
  const r = display.resources;
  const maxInfantry = Math.min(r.trainedPopulation, r.weapons, r.armors);
  const maxCavalry = Math.min(r.trainedPopulation, r.weapons, r.armors, r.horses);

  const missing = (inf: number, cav: number) => {
    const need = { trained: inf + cav, weapons: inf + cav, armors: inf + cav, horses: cav };
    const miss: string[] = [];
    if (need.trained > r.trainedPopulation) miss.push(`训练人口 ${fmt(need.trained - r.trainedPopulation)}`);
    if (need.weapons > r.weapons) miss.push(`武器 ${fmt(need.weapons - r.weapons)}`);
    if (need.armors > r.armors) miss.push(`盔甲 ${fmt(need.armors - r.armors)}`);
    if (need.horses > r.horses) miss.push(`战马 ${fmt(need.horses - r.horses)}`);
    return miss;
  };

  const craft = async (inf: number, cav: number) => {
    if (inf + cav <= 0) return;
    setBusy(true);
    const ok = await mutate(() => api.craft(inf, cav));
    setBusy(false);
    if (ok) {
      const id = Date.now();
      setFloats((f) => [...f, { id, text: `+${fmt(inf)} 步兵 +${fmt(cav)} 骑兵` }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
      setInfantry(0);
      setCavalry(0);
    }
  };

  const infantryMiss = missing(infantry, 0);
  const cavalryMiss = missing(0, cavalry);

  return (
    <div className="h-full overflow-y-auto p-4 relative">
      <div className="max-w-3xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-gold2">士兵合成（编军）</h2>
        <div className="bg-panel border border-line rounded p-3 text-xs text-muted space-y-1">
          <div>步兵 = 1 训练后人口 + 1 武器 + 1 盔甲</div>
          <div>骑兵 = 1 训练后人口 + 1 武器 + 1 盔甲 + 1 战马（攻城时攻击 ×0.7，行军速度 ×1.8）</div>
          <div className="text-gold">合成后的士兵进入「可用士兵池」，在军团页组建军团时使用。</div>
        </div>

        <Card title="步兵合成" right={<span className="text-xs text-muted">最大 {fmt(maxInfantry)}</span>}>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">训练人口</div><div className="font-semibold text-text tabular">{fmt(r.trainedPopulation)}</div></div>
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">武器</div><div className="font-semibold text-text tabular">{fmt(r.weapons)}</div></div>
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">盔甲</div><div className="font-semibold text-text tabular">{fmt(r.armors)}</div></div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><NumInput value={infantry} onChange={setInfantry} max={maxInfantry} step={10} ariaLabel="合成步兵" /></div>
            <Btn onClick={() => setInfantry(maxInfantry)} variant="ghost">最大</Btn>
            <Btn onClick={() => craft(infantry, 0)} disabled={busy || infantry <= 0 || infantryMiss.length > 0} className="!px-5">
              合成步兵
            </Btn>
          </div>
          {infantry > 0 && infantryMiss.length > 0 && (
            <div className="text-danger text-xs mt-1.5">缺少：{infantryMiss.join('、')}</div>
          )}
          {infantry > 0 && infantryMiss.length === 0 && (
            <div className="text-xs text-muted mt-1.5">
              合成后：训练人口 {fmt(r.trainedPopulation - infantry)} · 武器 {fmt(r.weapons - infantry)} · 盔甲 {fmt(r.armors - infantry)} · 步兵 {fmt(r.infantry + infantry)}
            </div>
          )}
        </Card>

        <Card title="骑兵合成" right={<span className="text-xs text-muted">最大 {fmt(maxCavalry)}</span>}>
          <div className="grid grid-cols-4 gap-2 text-xs mb-2">
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">训练人口</div><div className="font-semibold text-text tabular">{fmt(r.trainedPopulation)}</div></div>
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">武器</div><div className="font-semibold text-text tabular">{fmt(r.weapons)}</div></div>
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">盔甲</div><div className="font-semibold text-text tabular">{fmt(r.armors)}</div></div>
            <div className="bg-panel2/60 rounded p-2"><div className="text-muted">战马</div><div className="font-semibold text-text tabular">{fmt(r.horses)}</div></div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><NumInput value={cavalry} onChange={setCavalry} max={maxCavalry} step={10} ariaLabel="合成骑兵" /></div>
            <Btn onClick={() => setCavalry(maxCavalry)} variant="ghost">最大</Btn>
            <Btn onClick={() => craft(0, cavalry)} disabled={busy || cavalry <= 0 || cavalryMiss.length > 0} className="!px-5">
              合成骑兵
            </Btn>
          </div>
          {cavalry > 0 && cavalryMiss.length > 0 && (
            <div className="text-danger text-xs mt-1.5">缺少：{cavalryMiss.join('、')}</div>
          )}
          {cavalry > 0 && cavalryMiss.length === 0 && (
            <div className="text-xs text-muted mt-1.5">
              合成后：训练人口 {fmt(r.trainedPopulation - cavalry)} · 战马 {fmt(r.horses - cavalry)} · 骑兵 {fmt(r.cavalry + cavalry)}
            </div>
          )}
        </Card>

        <div className="text-xs text-muted pb-4">
          当前可用士兵池：步兵 {fmt(Math.max(0, r.infantry - display.cities.reduce((s, c) => s + c.infantry, 0) - display.armies.reduce((s, a) => s + a.infantry, 0)))} · 骑兵 {fmt(Math.max(0, r.cavalry - display.cities.reduce((s, c) => s + c.cavalry, 0) - display.armies.reduce((s, a) => s + a.cavalry, 0)))}
        </div>
      </div>
      {floats.map((f) => (
        <div key={f.id} className="float-up fixed left-1/2 top-1/3 -translate-x-1/2 text-gold font-bold pointer-events-none z-50">
          {f.text}
        </div>
      ))}
    </div>
  );
}
