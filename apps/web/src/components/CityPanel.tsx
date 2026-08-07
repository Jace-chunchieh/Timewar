import { useMemo, useState } from 'react';
import type { GameState } from '@timewar/shared';
import {
  balance,
  canAttackClient,
  cities,
  cityName,
  cityProvinceId,
  commandCapClient,
  defenseBonusOf,
  enemyGarrison,
  expectedBattle,
  marchTimeClient,
  marchTimeFallbackClient,
  talismanCostClient,
  troopPoolClient,
} from '../lib/game';
import { fmt, fmtDur, fmtPct } from '../lib/format';
import { api } from '../api';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, Field, NumInput, ProgressBar } from './ui';

export function AttackForm({ targetCityId, originCityId }: { targetCityId: string; originCityId?: string }) {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const ownedCities = useGame((s) => s.state?.cities ?? []);
  const generals = useGame((s) => s.state?.generals ?? []);
  const selectCity = useGame((s) => s.selectCity);
  const [origin, setOrigin] = useState(originCityId ?? ownedCities[0]?.cityId ?? 'acity');
  const [generalId, setGeneralId] = useState('');
  const [infantry, setInfantry] = useState(0);
  const [cavalry, setCavalry] = useState(0);
  const [useTalisman, setUseTalisman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const idleGenerals = generals.filter((g) => g.status === 'IDLE');
  const general = generals.find((g) => g.id === generalId);
  const cap = general ? commandCapClient(general.level, display ?? undefined) : 0;
  const pool = display ? troopPoolClient(display) : { infantry: 0, cavalry: 0 };
  const maxInf = Math.min(pool.infantry, Math.max(0, cap - cavalry));
  const maxCav = Math.min(pool.cavalry, Math.max(0, cap - infantry));
  const speedMul = 1 + (display?.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
  const routeTime = origin && display
    ? (marchTimeClient(origin, targetCityId, infantry, cavalry, speedMul) ||
        marchTimeFallbackClient(origin, targetCityId, infantry, cavalry, speedMul))
    : 0;
  const attackable = display ? canAttackClient(display, targetCityId) : false;
  const talismanNeed = display && origin ? talismanCostClient(cityProvinceId(origin), cityProvinceId(targetCityId)) : 0;
  const talismanShort = useTalisman && (display?.tech.talismans ?? 0) < talismanNeed;
  const expected = display && general
    ? expectedBattle(display, general.level, infantry, cavalry, targetCityId)
    : null;
  const canSubmit = !busy && !!general && infantry + cavalry > 0 && infantry <= maxInf && cavalry <= maxCav && (!useTalisman || !talismanShort);

  const submit = async () => {
    setBusy(true);
    setLocalErr(null);
    const ok = await mutate(() =>
      api.armyCreate({
        originCityId: origin,
        generalId,
        infantry,
        cavalry,
        targetCityId,
        useTalisman,
      })
    );
    setBusy(false);
    if (ok) {
      setInfantry(0);
      setCavalry(0);
    }
  };

  return (
    <Card title={`出征 · 目标 ${cityName(targetCityId)}`}>
      <div className="space-y-2.5">
        <Field label="出发城市">
          <select
            className="w-full h-8 rounded bg-bg border border-line text-text text-sm"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            {ownedCities.map((c) => (
              <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
            ))}
          </select>
        </Field>
        <Field label="选择将领" hint={idleGenerals.length === 0 ? '没有空闲将领' : undefined}>
          <select
            className="w-full h-8 rounded bg-bg border border-line text-text text-sm"
            value={generalId}
            onChange={(e) => setGeneralId(e.target.value)}
          >
            <option value="">请选择空闲将领</option>
            {idleGenerals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}（Lv.{g.level} 统帅{commandCapClient(g.level, display ?? undefined)}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="步兵" hint={`可用 ${fmt(pool.infantry)}`}>
          <NumInput value={infantry} onChange={setInfantry} max={maxInf} step={10} />
        </Field>
        <Field label="骑兵" hint={`可用 ${fmt(pool.cavalry)}`}>
          <NumInput value={cavalry} onChange={setCavalry} max={maxCav} step={10} />
        </Field>
        <div className="flex justify-between text-xs">
          <span className="text-muted">统帅占用</span>
          <span className={`tabular ${infantry + cavalry > cap ? 'text-danger' : 'text-text'}`}>
            {infantry + cavalry} / {cap}
          </span>
        </div>
        <ProgressBar value={infantry + cavalry} max={Math.max(1, cap)} />
        <div className="flex justify-between text-xs">
          <span className="text-muted">行军时间</span>
          <span className="text-text tabular">{routeTime > 0 ? fmtDur(routeTime * 1000) : '—'}</span>
        </div>
        {expected && infantry + cavalry > 0 && (
          <div className="bg-panel2/70 rounded p-2 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted">预计进攻战力</span><span className="text-gold tabular">{fmt(expected.attackerPower)}</span></div>
            <div className="flex justify-between"><span className="text-muted">敌方防守战力</span><span className="text-danger tabular">{fmt(expected.defenderPower)}</span></div>
            <div className="flex justify-between"><span className="text-muted">预计胜率（估算）</span><span className="text-gold2 tabular">{fmtPct(expected.winProbability)}</span></div>
          </div>
        )}
        {!attackable && (
          <div className="bg-panel2/70 rounded p-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-muted">
                该城市与己方无相邻路线，可使用神行符远征（需 {talismanNeed} 张，持有 {fmt(display?.tech.talismans ?? 0)}）
              </span>
              <input
                type="checkbox"
                checked={useTalisman}
                onChange={(e) => setUseTalisman(e.target.checked)}
                className="accent-[#d4a94e] w-4 h-4"
              />
            </label>
          </div>
        )}
        {useTalisman && (
          <div className="text-xs text-muted">
            神行符远征：消耗 <span className={talismanShort ? 'text-danger' : 'text-gold'}>{talismanNeed} 张</span>，突破接壤限制
          </div>
        )}
        {infantry + cavalry > cap && (
          <div className="text-danger text-xs">
            当前军团 {infantry + cavalry} 人，将领统帅 {cap} 人，超出 {infantry + cavalry - cap} 人
          </div>
        )}
        {localErr && <div className="text-danger text-xs">{localErr}</div>}
        <Btn variant="orange" disabled={!canSubmit} onClick={submit} className="w-full py-2">
          {busy ? '出征中…' : '确认出征'}
        </Btn>
        <button className="w-full text-center text-xs text-muted hover:text-text" onClick={() => selectCity(null)}>
          关闭
        </button>
      </div>
    </Card>
  );
}

export function TransferForm({ originCityId }: { originCityId: string }) {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const generals = useGame((s) => s.state?.generals ?? []);
  const citiesOwned = useGame((s) => s.state?.cities ?? []);
  const [target, setTarget] = useState('');
  const [generalId, setGeneralId] = useState('');
  const [infantry, setInfantry] = useState(0);
  const [cavalry, setCavalry] = useState(0);
  const [busy, setBusy] = useState(false);
  const city = display?.cities.find((c) => c.cityId === originCityId);
  const idleGenerals = generals.filter((g) => g.status === 'IDLE');
  const routeTime = target && display ? marchTimeClient(originCityId, target, infantry, cavalry) : 0;
  const canSubmit = !!target && infantry + cavalry > 0 && infantry <= (city?.infantry ?? 0) && cavalry <= (city?.cavalry ?? 0);

  const submit = async () => {
    setBusy(true);
    const ok = await mutate(() =>
      api.armyTransfer({ originCityId, targetCityId: target, infantry, cavalry, generalId: generalId || undefined })
    );
    setBusy(false);
    if (ok) {
      setInfantry(0);
      setCavalry(0);
    }
  };

  return (
    <Card title={`调兵 · 增援`}>
      <div className="space-y-2.5">
        <Field label="目标城市" hint="须为已占领城市">
          <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">选择己方城市</option>
            {citiesOwned.filter((c) => c.cityId !== originCityId).map((c) => (
              <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
            ))}
          </select>
        </Field>
        <Field label="随行将领（可选）">
          <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={generalId} onChange={(e) => setGeneralId(e.target.value)}>
            <option value="">无将领（纯增援）</option>
            {idleGenerals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}（Lv.{g.level}）</option>
            ))}
          </select>
        </Field>
        <Field label="步兵" hint={`驻军 ${fmt(city?.infantry ?? 0)}`}>
          <NumInput value={infantry} onChange={setInfantry} max={city?.infantry ?? 0} step={10} />
        </Field>
        <Field label="骑兵" hint={`驻军 ${fmt(city?.cavalry ?? 0)}`}>
          <NumInput value={cavalry} onChange={setCavalry} max={city?.cavalry ?? 0} step={10} />
        </Field>
        <div className="flex justify-between text-xs">
          <span className="text-muted">行军时间</span>
          <span className="text-text tabular">{routeTime > 0 ? fmtDur(routeTime * 1000) : '—'}</span>
        </div>
        <Btn variant="gold" disabled={!canSubmit || busy} onClick={submit} className="w-full py-2">
          {busy ? '派遣中…' : '派遣增援'}
        </Btn>
      </div>
    </Card>
  );
}

export default function CityPanel({ cityId }: { cityId: string }) {
  const display = useDisplay();
  const selectCity = useGame((s) => s.selectCity);
  if (!display) return null;
  const config = cities.find((c) => c.id === cityId)!;
  const player = display.cities.find((c) => c.cityId === cityId);
  const enemy = display.enemyCities.find((e) => e.cityId === cityId);
  const neighborNames = useMemo(
    () => config.neighbors.map((n) => `${cityName(n)}${display.cities.some((c) => c.cityId === n) ? '（己方）' : ''}`).join('、'),
    [config, display]
  );

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-text">{config.name}</div>
          <div className="text-xs text-muted">
            {config.province} · {config.level}级城市 · {player ? '己方占领' : enemy ? '敌方' : ''}
            {config.id === 'acity' && ' · 虚拟城市'}
          </div>
        </div>
        <button className="text-muted px-2" onClick={() => selectCity(null)}>✕</button>
      </div>

      {player ? (
        <>
          {config.id === 'acity' && (
            <div className="bg-panel2/60 border border-gold/30 rounded p-2.5 text-xs text-gold">
              虚拟城市：等级随你拥有的最高真实城市自动提升（当前 Lv.{player.level}）。
              当前人口产出 +{balance.populationPerCityPerInterval[String(player.level)]}/10秒。
            </div>
          )}
          <Card title="驻军情况">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-panel2/60 rounded p-2">
                <div className="text-xs text-muted">步兵</div>
                <div className="text-lg font-semibold text-gold tabular">{fmt(player.infantry)}</div>
              </div>
              <div className="bg-panel2/60 rounded p-2">
                <div className="text-xs text-muted">骑兵</div>
                <div className="text-lg font-semibold text-gold tabular">{fmt(player.cavalry)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted">
              驻守将领：
              {player.generalId ? (
                <span className="text-text">{display.generals.find((g) => g.id === player.generalId)?.name ?? '—'}（可在将领页调回）</span>
              ) : (
                '无'
              )}
            </div>
            <div className="mt-1 text-xs text-muted">无驻军也不影响人口产出（MVP 暂无双城反攻）</div>
          </Card>
          <TransferForm originCityId={cityId} />
        </>
      ) : enemy ? (
        <>
          <Card title="敌方情报">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">守军</span><span className="text-danger tabular">{fmt(enemy.garrison)}</span></div>
              <div className="flex justify-between"><span className="text-muted">城防加成</span><span className="text-text tabular">+{fmtPct(defenseBonusOf(cityId))}</span></div>
              <div className="flex justify-between"><span className="text-muted">守军上限</span><span className="text-text tabular">{fmt(balance.cityLevels[String(config.level)].garrisonCap)}</span></div>
              <div className="flex justify-between"><span className="text-muted">增长</span><span className="text-text tabular">每10分钟 +{balance.cityLevels[String(config.level)].growthPer10Min}</span></div>
            </div>
            <div className="mt-2 text-xs text-muted">相邻：{neighborNames}</div>
          </Card>
          <AttackForm targetCityId={cityId} />
        </>
      ) : null}

      <div className="text-xs text-muted text-center pb-2">
        人口产出：每10秒 = Σ 已占领城市等级（1级+1 … 5级+5），受军屯科技加成
      </div>
    </div>
  );
}
