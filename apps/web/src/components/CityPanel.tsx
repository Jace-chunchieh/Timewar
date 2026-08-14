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
  routeBetweenClient,
  talismanCostClient,
  troopPoolClient,
} from '../lib/game';
import { fmt, fmtDur, fmtPct } from '../lib/format';
import { api } from '../api';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, Field, NumInput, ProgressBar } from './ui';

export function AttackForm({ targetCityId }: { targetCityId: string }) {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const selectCity = useGame((s) => s.selectCity);
  const setView = useGame((s) => s.setView);
  const [mode, setMode] = useState<'army' | 'solo'>('army');
  const [armyId, setArmyId] = useState('');
  // 单将模式
  const [soloGeneralId, setSoloGeneralId] = useState('');
  const [soloInfantry, setSoloInfantry] = useState(200);
  const [soloCavalry, setSoloCavalry] = useState(0);
  const [useTalisman, setUseTalisman] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!display) return null;
  const armies = display.armies.filter((a) => a.status === 'IDLE' || a.status === 'GARRISON');
  const army = armies.find((a) => a.id === armyId);
  const banner = army ? display.generals.find((g) => g.id === army.bannerGeneralId) : undefined;
  const idleGenerals = display.generals.filter((g) => g.status === 'IDLE');
  const soloGeneral = display.generals.find((g) => g.id === soloGeneralId);
  const pool = troopPoolClient(display);
  const speedMul = 1 + (display.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
  const soloOrigin = display.capitalCityId || display.cities[0]?.cityId || 'acity';
  const routeTime = mode === 'army' && army
    ? (marchTimeClient(army.originCityId, targetCityId, army.infantry, army.cavalry, speedMul) ||
        marchTimeFallbackClient(army.originCityId, targetCityId, army.infantry, army.cavalry, speedMul))
    : mode === 'solo'
      ? (marchTimeClient(soloOrigin, targetCityId, soloInfantry, soloCavalry, speedMul) ||
          marchTimeFallbackClient(soloOrigin, targetCityId, soloInfantry, soloCavalry, speedMul))
      : 0;
  const talismanNeed = mode === 'army' && army
    ? talismanCostClient(cityProvinceId(army.originCityId), cityProvinceId(targetCityId))
    : mode === 'solo'
      ? talismanCostClient(cityProvinceId(soloOrigin), cityProvinceId(targetCityId))
      : 0;
  const talismanShort = useTalisman && (display.tech.talismans ?? 0) < talismanNeed;
  const soloCap = soloGeneral ? commandCapClient(soloGeneral.level, display) : 0;
  const soloMaxInf = Math.min(pool.infantry, Math.max(0, soloCap - soloCavalry));
  const soloMaxCav = Math.min(pool.cavalry, Math.max(0, soloCap - soloInfantry));
  const expected = mode === 'army' && army && banner
    ? expectedBattle(display, banner.level, army.infantry, army.cavalry, targetCityId)
    : mode === 'solo' && soloGeneral && soloInfantry + soloCavalry > 0
      ? expectedBattle(display, soloGeneral.level, soloInfantry, soloCavalry, targetCityId)
      : null;
  const canSubmit = busy
    ? false
    : mode === 'army'
      ? !!army && (!useTalisman || !talismanShort)
      : !!soloGeneral && soloInfantry + soloCavalry > 0 && soloInfantry <= soloMaxInf && soloCavalry <= soloMaxCav && (!useTalisman || !talismanShort);

  const submit = async () => {
    setBusy(true);
    if (mode === 'army') {
      if (!army) return;
      await mutate(() => api.armyMarch(army.id, targetCityId, useTalisman));
    } else {
      if (!soloGeneral) return;
      await mutate(() =>
        api.soloAttack({
          generalId: soloGeneral.id,
          targetCityId,
          infantry: soloInfantry,
          cavalry: soloCavalry,
          useTalisman,
        })
      );
    }
    setBusy(false);
  };

  const attackable = canAttackClient(display, targetCityId);

  return (
    <Card title={`出征 · 目标 ${cityName(targetCityId)}`}>
      <div className="space-y-2.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('army')}
            className={`px-3 py-1 rounded text-xs border cursor-pointer ${mode === 'army' ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel2 border-line text-muted'}`}
          >
            军团进攻
          </button>
          <button
            type="button"
            onClick={() => setMode('solo')}
            className={`px-3 py-1 rounded text-xs border cursor-pointer ${mode === 'solo' ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel2 border-line text-muted'}`}
          >
            单将进攻（无需军团旗）
          </button>
        </div>

        {mode === 'army' ? (
          <>
            <Field label="选择军团" hint={armies.length === 0 ? '暂无可用军团' : undefined}>
              <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={armyId} onChange={(e) => setArmyId(e.target.value)}>
                <option value="">选择军团</option>
                {armies.map((a) => (
                  <option key={a.id} value={a.id}>
                    🚩 {a.name}（步 {fmt(a.infantry)} · 骑 {fmt(a.cavalry)} · 驻地 {cityName(a.originCityId)}）
                  </option>
                ))}
              </select>
            </Field>
            {army && (
              <div className="text-xs text-muted">
                军团成员 {army.memberGeneralIds.length} 人 · 军团长 {banner?.name}（Lv.{banner?.level}，统帅 ×1.5）
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="选择将领" hint={idleGenerals.length === 0 ? '没有空闲将领' : undefined}>
              <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={soloGeneralId} onChange={(e) => setSoloGeneralId(e.target.value)}>
                <option value="">选择空闲将领</option>
                {idleGenerals.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}（Lv.{g.level} 统帅{fmt(commandCapClient(g.level, display))}）</option>
                ))}
              </select>
            </Field>
            <Field label="步兵" hint={`池 ${fmt(pool.infantry)}`}>
              <NumInput value={soloInfantry} onChange={setSoloInfantry} max={soloMaxInf} step={10} ariaLabel="单将步兵" />
            </Field>
            <Field label="骑兵" hint={`池 ${fmt(pool.cavalry)}`}>
              <NumInput value={soloCavalry} onChange={setSoloCavalry} max={soloMaxCav} step={10} ariaLabel="单将骑兵" />
            </Field>
            <div className="flex justify-between text-xs">
              <span className="text-muted">统帅占用</span>
              <span className={`tabular ${soloInfantry + soloCavalry > soloCap ? 'text-danger' : 'text-text'}`}>{soloInfantry + soloCavalry} / {soloCap}</span>
            </div>
            <div className="text-[11px] text-muted">从首都（{cityName(soloOrigin)}）出兵 · 无军团长加成</div>
          </>
        )}

        <div className="flex justify-between text-xs">
          <span className="text-muted">行军时间</span>
          <span className="text-text tabular">{routeTime > 0 ? fmtDur(routeTime * 1000) : '—'}</span>
        </div>
        {expected && (
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
                与己方无相邻路线，可使用神行符远征（需 {talismanNeed} 张，持有 {fmt(display.tech.talismans ?? 0)}）
              </span>
              <input type="checkbox" checked={useTalisman} onChange={(e) => setUseTalisman(e.target.checked)} className="accent-[#d4a94e] w-4 h-4" />
            </label>
          </div>
        )}
        {talismanShort && <div className="text-danger text-xs">神行符不足：需要 {talismanNeed} 张</div>}
        {!canSubmit && !busy && mode === 'solo' && (
          <div className="text-xs text-muted">
            {!soloGeneral ? '请选择空闲将领' : soloInfantry + soloCavalry <= 0 ? '请填写兵力' : soloInfantry + soloCavalry > soloCap ? '超出将领统帅上限' : talismanShort ? '神行符不足' : ''}
          </div>
        )}
        <Btn variant="orange" disabled={!canSubmit} onClick={submit} className="w-full py-2">
          {busy ? '出征中…' : '确认出征'}
        </Btn>
        <button className="w-full text-center text-xs text-muted hover:text-text" onClick={() => { selectCity(null); setView('armies'); }}>
          前往军团页管理军团 →
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
  const [useTalisman, setUseTalisman] = useState(false);
  const [busy, setBusy] = useState(false);
  const city = display?.cities.find((c) => c.cityId === originCityId);
  const idleGenerals = generals.filter((g) => g.status === 'IDLE');
  const hasRoute = !!target && !!routeBetweenClient(originCityId, target);
  const speedMul = 1 + (display?.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
  const routeTime = target && display
    ? (marchTimeClient(originCityId, target, infantry, cavalry, speedMul) ||
        marchTimeFallbackClient(originCityId, target, infantry, cavalry, speedMul))
    : 0;
  const talismanNeed = target ? talismanCostClient(cityProvinceId(originCityId), cityProvinceId(target)) : 0;
  const talismanShort = useTalisman && !hasRoute && (display?.tech.talismans ?? 0) < talismanNeed;
  const canSubmit = !!target && infantry + cavalry > 0 && infantry <= (city?.infantry ?? 0) && cavalry <= (city?.cavalry ?? 0) && !talismanShort;

  const submit = async () => {
    setBusy(true);
    const ok = await mutate(() =>
      api.armyTransfer({
        originCityId,
        targetCityId: target,
        infantry,
        cavalry,
        generalId: generalId || undefined,
        useTalisman: useTalisman && !hasRoute,
      })
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
            {citiesOwned.filter((c) => c.cityId !== originCityId).map((c) => {
              const noRoute = !routeBetweenClient(originCityId, c.cityId);
              return (
                <option key={c.cityId} value={c.cityId}>
                  {cityName(c.cityId)}{noRoute ? `（无路线，需神行符 ${talismanCostClient(cityProvinceId(originCityId), cityProvinceId(c.cityId))} 张）` : ''}
                </option>
              );
            })}
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
        {!hasRoute && target && (
          <div className="bg-panel2/60 rounded p-2 flex items-center justify-between">
            <span className="text-xs text-muted">两城无直达路线，使用神行符增援（需 {talismanNeed} 张）</span>
            <input type="checkbox" checked={useTalisman} onChange={(e) => setUseTalisman(e.target.checked)} className="accent-[#d4a94e] w-4 h-4" />
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-muted">行军时间</span>
          <span className="text-text tabular">{routeTime > 0 ? fmtDur(routeTime * 1000) : '—'}</span>
        </div>
        {talismanShort && <div className="text-danger text-xs">神行符不足：需要 {talismanNeed} 张，持有 {fmt(display?.tech.talismans ?? 0)}</div>}
        <Btn variant="gold" disabled={!canSubmit || busy} onClick={submit} className="w-full py-2">
          {busy ? '派遣中…' : '派遣增援'}
        </Btn>
      </div>
    </Card>
  );
}

// 驻守将领从驻守地调兵攻打周边
export function GarrisonAttackForm({ cityId }: { cityId: string }) {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const [target, setTarget] = useState('');
  const [infantry, setInfantry] = useState(0);
  const [cavalry, setCavalry] = useState(0);
  const [useTalisman, setUseTalisman] = useState(false);
  const [busy, setBusy] = useState(false);
  const city = display?.cities.find((c) => c.cityId === cityId);
  const general = display?.generals.find((g) => g.id === city?.generalId);
  if (!display || !city) return null;
  const cap = general ? commandCapClient(general.level, display) : 0;
  const attackableTargets = display.enemyCities.filter((e) => canAttackClient(display, e.cityId));
  const speedMul = 1 + (display.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
  const hasRoute = !!target && !!routeBetweenClient(cityId, target);
  const routeTime = target
    ? (marchTimeClient(cityId, target, infantry, cavalry, speedMul) ||
        marchTimeFallbackClient(cityId, target, infantry, cavalry, speedMul))
    : 0;
  const talismanNeed = target ? talismanCostClient(cityProvinceId(cityId), cityProvinceId(target)) : 0;
  const talismanShort = useTalisman && !hasRoute && (display.tech.talismans ?? 0) < talismanNeed;
  const expected = general && target
    ? expectedBattle(display, general.level, infantry, cavalry, target)
    : null;
  const canSubmit = !!target && !!general && infantry + cavalry > 0 && infantry <= city.infantry && cavalry <= city.cavalry && !talismanShort;

  const submit = async () => {
    if (!general || !target) return;
    setBusy(true);
    const ok = await mutate(() =>
      api.garrisonAttack({
        garrisonCityId: cityId,
        generalId: general.id,
        targetCityId: target,
        infantry,
        cavalry,
        useTalisman: useTalisman && !hasRoute,
      })
    );
    setBusy(false);
    if (ok) {
      setInfantry(0);
      setCavalry(0);
      setTarget('');
    }
  };

  return (
    <Card title="驻守出征 · 攻占周边">
      <div className="space-y-2.5">
        {general ? (
          <>
            <div className="text-xs text-muted">
              统率将领：<span className="text-gold">{general.name}</span>（Lv.{general.level} 统帅 {fmt(cap)}）
            </div>
            <Field label="目标城市" hint="敌方城市">
              <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">选择目标</option>
                <optgroup label="相邻敌方城市">
                  {attackableTargets.map((e) => (
                    <option key={e.cityId} value={e.cityId}>{cityName(e.cityId)}（守军 {fmt(e.garrison)}）</option>
                  ))}
                </optgroup>
                {useTalisman && (
                  <optgroup label="全部敌方城市（神行符）">
                    {display.enemyCities.map((e) => (
                      <option key={e.cityId} value={e.cityId}>
                        {cityName(e.cityId)}（{fmt(e.garrison)} · {talismanCostClient(cityProvinceId(cityId), cityProvinceId(e.cityId))}张）
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
            <Field label="步兵" hint={`驻军 ${fmt(city.infantry)}`}>
              <NumInput value={infantry} onChange={setInfantry} max={Math.min(city.infantry, Math.max(0, cap - cavalry))} step={10} ariaLabel="驻守步兵" />
            </Field>
            <Field label="骑兵" hint={`驻军 ${fmt(city.cavalry)}`}>
              <NumInput value={cavalry} onChange={setCavalry} max={Math.min(city.cavalry, Math.max(0, cap - infantry))} step={10} ariaLabel="驻守骑兵" />
            </Field>
            <div className="flex justify-between text-xs">
              <span className="text-muted">统帅占用</span>
              <span className={`tabular ${infantry + cavalry > cap ? 'text-danger' : 'text-text'}`}>{infantry + cavalry} / {cap}</span>
            </div>
            <ProgressBar value={infantry + cavalry} max={Math.max(1, cap)} />
            {!hasRoute && target && (
              <div className="bg-panel2/60 rounded p-2 flex items-center justify-between">
                <span className="text-xs text-muted">无直达路线，使用神行符远征（需 {talismanNeed} 张）</span>
                <input type="checkbox" checked={useTalisman} onChange={(e) => setUseTalisman(e.target.checked)} className="accent-[#d4a94e] w-4 h-4" />
              </div>
            )}
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
            {talismanShort && <div className="text-danger text-xs">神行符不足：需要 {talismanNeed} 张，持有 {fmt(display.tech.talismans ?? 0)}</div>}
            {!canSubmit && !busy && (
              <div className="text-xs text-muted">
                {!target ? '请选择目标城市' : infantry + cavalry <= 0 ? '请填写兵力' : infantry > city.infantry || cavalry > city.cavalry ? '兵力超出驻军' : infantry + cavalry > cap ? '超出统帅上限' : talismanShort ? '神行符不足' : '尚不满足出征条件'}
              </div>
            )}
            <Btn variant="orange" disabled={!canSubmit} onClick={submit} className="w-full py-2">
              {busy ? '出征中…' : '确认出征'}
            </Btn>
          </>
        ) : (
          <div className="text-xs text-muted py-1">本城无驻守将领，无法率驻军出征。可在将领页指派将领驻守。</div>
        )}
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
          <GarrisonAttackForm cityId={cityId} />
        </>
      ) : enemy ? (
        <>
          <Card title="敌方情报">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">守军</span><span className="text-danger tabular">{fmt(enemy.garrison)}</span></div>
              {enemy.defender && (
                <div className="flex justify-between">
                  <span className="text-muted">守将</span>
                  <span className="text-orange">{enemy.defender.name}（Lv.{enemy.defender.level}）</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted">城防加成</span><span className="text-text tabular">+{fmtPct(defenseBonusOf(cityId))}</span></div>
              <div className="flex justify-between"><span className="text-muted">守军上限</span><span className="text-text tabular">{fmt(balance.cityLevels[String(config.level)].garrisonCap)}</span></div>
              <div className="flex justify-between"><span className="text-muted">增长</span><span className="text-text tabular">每10分钟 +{balance.cityLevels[String(config.level)].growthPer10Min}</span></div>
            </div>
            <div className="mt-2 text-xs text-muted">
              相邻：{neighborNames}
              {enemy.defender && <div className="mt-1 text-gold">占领后有 {fmtPct(balance.defender.recruitChance)} 概率招募守将{enemy.defender.name}为我方将领</div>}
            </div>
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
