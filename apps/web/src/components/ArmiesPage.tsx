import { useState } from 'react';
import { api } from '../api';
import { fmt, fmtDur } from '../lib/format';
import {
  balance,
  canAttackClient,
  cityName,
  cityProvinceId,
  commandCapClient,
  expectedBattle,
  marchTimeClient,
  marchTimeFallbackClient,
  talismanCostClient,
  troopPoolClient,
} from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, Field, NumInput, ProgressBar } from './ui';

export default function ArmiesPage() {
  const display = useDisplay();
  const state = useGame((s) => s.state);
  const mutate = useGame((s) => s.mutate);
  const selectCity = useGame((s) => s.selectCity);
  const [origin, setOrigin] = useState('acity');
  const [selectedGeneralIds, setSelectedGeneralIds] = useState<string[]>([]);
  const [armyName, setArmyName] = useState('');
  const [strategy, setStrategy] = useState<'NORMAL' | 'DEFENSIVE' | 'CHARGE'>('NORMAL');
  const [infantry, setInfantry] = useState(200);
  const [cavalry, setCavalry] = useState(0);
  const [target, setTarget] = useState('');
  const [useTalisman, setUseTalisman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyArmyId, setBusyArmyId] = useState<string | null>(null);

  if (!display || !state) return null;
  const now = Date.now();
  const pool = troopPoolClient(display);
  const idleGenerals = display.generals.filter((g) => g.status === 'IDLE');
  const selectedGenerals = selectedGeneralIds
    .map((id) => display.generals.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);
  const isFriendlyTarget = !!target && display.cities.some((c) => c.cityId === target);
  const cap = selectedGenerals.reduce((s, g) => s + commandCapClient(g.level, display), 0);
  const maxInf = Math.min(pool.infantry, Math.max(0, cap - cavalry));
  const maxCav = Math.min(pool.cavalry, Math.max(0, cap - infantry));
  const attackableTargets = display.enemyCities.filter((e) => canAttackClient(display, e.cityId));
  const friendlyTargets = display.cities;
  const allEnemyTargets = display.enemyCities;
  const speedMul = 1 + (display.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
  const routeTime = target
    ? (marchTimeClient(origin, target, infantry, cavalry, speedMul) ||
        marchTimeFallbackClient(origin, target, infantry, cavalry, speedMul))
    : 0;
  const talismanNeed = target ? talismanCostClient(cityProvinceId(origin), cityProvinceId(target)) : 0;
  const talismanShort = useTalisman && (display.tech?.talismans ?? 0) < talismanNeed;
  const expected = selectedGenerals.length > 0 && target && display.enemyCities.some((e) => e.cityId === target)
    ? expectedBattle(display, selectedGenerals[0].level, infantry, cavalry, target)
    : null;
  // 攻城必须将领
  const attackWithoutGeneral = !!target && !isFriendlyTarget && selectedGenerals.length === 0;

  const toggleGeneral = (id: string) => {
    setSelectedGeneralIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const createArmy = async () => {
    if (!target || infantry + cavalry <= 0 || attackWithoutGeneral) return;
    setBusy(true);
    const ok = await mutate(() =>
      api.armyCreate({
        originCityId: origin,
        generalIds: selectedGenerals.map((g) => g.id),
        name: armyName || undefined,
        strategy,
        infantry,
        cavalry,
        targetCityId: target,
        useTalisman,
      })
    );
    setBusy(false);
    if (ok) {
      setInfantry(0);
      setCavalry(0);
      setTarget('');
      setUseTalisman(false);
      setSelectedGeneralIds([]);
      setArmyName('');
    }
  };

  const march = async (armyId: string, targetCityId: string) => {
    setBusyArmyId(armyId);
    await mutate(() => api.armyMarch(armyId, targetCityId));
    setBusyArmyId(null);
  };

  const cancelMarch = async (armyId: string) => {
    setBusyArmyId(armyId);
    await mutate(() => api.armyCancelMarch(armyId));
    setBusyArmyId(null);
  };

  const marching = display.armies.filter((a) => a.status === 'MARCHING');
  const returning = display.armies.filter((a) => a.status === 'RETURNING');
  const idleArmies = display.armies.filter((a) => a.status === 'IDLE');
  const garrisoned = display.cities.filter((c) => c.generalId);
  const camps = display.barbarianCamps ?? [];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold2">军团</h2>
          <div className="text-xs text-muted">
            可用士兵池：步兵 <span className="text-gold tabular">{fmt(pool.infantry)}</span> · 骑兵 <span className="text-gold tabular">{fmt(pool.cavalry)}</span>
          </div>
        </div>

        <Card title="组建军团并出征">
          <div className="space-y-2.5">
            <div className="grid md:grid-cols-2 gap-2.5">
              <Field label="出发城市">
                <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {display.cities.map((c) => (
                    <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
                  ))}
                </select>
              </Field>
              <Field label="将领（可多选 ≤3）" hint={isFriendlyTarget ? '增援可无将领' : '攻城必须选择将领'}>
                <div className="flex flex-wrap gap-1.5">
                  {idleGenerals.slice(0, 8).map((g) => {
                    const checked = selectedGeneralIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGeneral(g.id)}
                        className={`px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
                          checked ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel2 border-line text-muted hover:text-text'
                        }`}
                      >
                        {g.name}（Lv.{g.level} 统帅{fmt(commandCapClient(g.level, display))}）
                      </button>
                    );
                  })}
                  {idleGenerals.length > 8 && <span className="text-xs text-muted self-center">…</span>}
                </div>
              </Field>
              <Field label="军团番号（可选）">
                <input
                  value={armyName}
                  onChange={(e) => setArmyName(e.target.value)}
                  maxLength={8}
                  placeholder="如：虎啸营（≤8字）"
                  className="w-full h-8 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70"
                />
              </Field>
              <Field label="步兵" hint={`池 ${fmt(pool.infantry)}`}>
                <NumInput value={infantry} onChange={setInfantry} max={maxInf} step={10} ariaLabel="军团步兵" />
              </Field>
              <Field label="骑兵" hint={`池 ${fmt(pool.cavalry)}`}>
                <NumInput value={cavalry} onChange={setCavalry} max={maxCav} step={10} ariaLabel="军团骑兵" />
              </Field>
            </div>
            <Field label="战斗策略">
              <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
                <option value="NORMAL">常规</option>
                <option value="DEFENSIVE">稳守（战力×0.95，伤亡×0.85）</option>
                <option value="CHARGE">突袭（战力×1.08，伤亡×1.1）</option>
              </select>
            </Field>
            <div className="flex justify-between text-xs">
              <span className="text-muted">统帅占用（{selectedGenerals.length} 将）</span>
              <span className={`tabular ${infantry + cavalry > cap ? 'text-danger' : 'text-text'}`}>{infantry + cavalry} / {cap}</span>
            </div>
            <ProgressBar value={infantry + cavalry} max={Math.max(1, cap)} />
            <Field label="目标城市" hint={attackableTargets.length === 0 ? '暂无相邻敌方城市' : undefined}>
              <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">选择目标（敌方/己方）</option>
                <optgroup label="可进攻的敌方城市">
                  {attackableTargets.map((e) => (
                    <option key={e.cityId} value={e.cityId}>{cityName(e.cityId)}（守军 {fmt(e.garrison)}）</option>
                  ))}
                </optgroup>
                {useTalisman && (
                  <optgroup label="全部敌方城市（神行符远征）">
                    {allEnemyTargets.map((e) => (
                      <option key={e.cityId} value={e.cityId}>
                        {cityName(e.cityId)}（{fmt(e.garrison)} · 需{talismanCostClient(cityProvinceId(origin), cityProvinceId(e.cityId))}张）
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="己方城市（增援）">
                  {friendlyTargets.filter((c) => c.cityId !== origin).map((c) => (
                    <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            {routeTime > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted">行军时间</span>
                <span className="text-text tabular">{fmtDur(routeTime * 1000)}</span>
              </div>
            )}
            {expected && infantry + cavalry > 0 && (
              <div className="bg-panel2/70 rounded p-2 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted">预计进攻战力</span><span className="text-gold tabular">{fmt(expected.attackerPower)}</span></div>
                <div className="flex justify-between"><span className="text-muted">敌方防守战力</span><span className="text-danger tabular">{fmt(expected.defenderPower)}</span></div>
                <div className="flex justify-between"><span className="text-muted">预计胜率（估算）</span><span className="text-gold2 tabular">{Math.round(expected.winProbability * 100)}%</span></div>
              </div>
            )}
            {infantry + cavalry > cap && (
              <div className="text-danger text-xs">当前军团 {infantry + cavalry} 人，将领合计统帅 {cap} 人，超出 {infantry + cavalry - cap} 人</div>
            )}
            {attackWithoutGeneral && (
              <div className="text-danger text-xs">攻城必须由将领统率，请至少选择 1 名将领</div>
            )}
            {useTalisman && target && (
              <div className="text-xs text-muted">
                神行符远征：消耗 <span className={talismanShort ? 'text-danger' : 'text-gold'}>{talismanNeed} 张</span>（持有 {fmt(display.tech?.talismans ?? 0)}）
              </div>
            )}
            <label className="flex items-center justify-between bg-panel2/50 rounded p-2 cursor-pointer">
              <span className="text-xs text-muted">神行符：突破接壤限制，可攻打任意省份城市</span>
              <input
                type="checkbox"
                checked={useTalisman}
                onChange={(e) => {
                  setUseTalisman(e.target.checked);
                  if (!e.target.checked) setTarget('');
                }}
                className="accent-[#d4a94e] w-4 h-4"
              />
            </label>
            <Btn onClick={createArmy} disabled={busy || !target || infantry + cavalry <= 0 || talismanShort || attackWithoutGeneral} className="w-full py-2">
              {busy ? '提交中…' : '确认出征'}
            </Btn>
            {!busy && (!target || infantry + cavalry <= 0 || talismanShort || attackWithoutGeneral) && (
              <div className="text-xs text-muted">
                {attackWithoutGeneral
                  ? '攻城必须由将领统率，请选择将领'
                  : !target
                    ? '请选择目标城市'
                    : infantry + cavalry <= 0
                      ? '请填写步兵/骑兵数量'
                      : talismanShort
                        ? `神行符不足：需要 ${talismanNeed} 张，持有 ${fmt(display.tech?.talismans ?? 0)}`
                        : '尚不满足出征条件'}
              </div>
            )}
          </div>
        </Card>

        {idleArmies.length > 0 && (
          <Card title={`空闲军团（${idleArmies.length}）`}>
            <div className="space-y-2">
              {idleArmies.map((a) => {
                const g = display.generals.find((x) => x.id === a.generalId);
                const targets = display.enemyCities.filter((e) => canAttackClient(display, e.cityId));
                return (
                  <div key={a.id} className="bg-panel2/60 rounded p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>{g?.name} · 步兵 {fmt(a.infantry)} · 骑兵 {fmt(a.cavalry)}</span>
                      <span className="text-muted">位于 {cityName(a.originCityId)}</span>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <select className="flex-1 h-8 rounded bg-bg border border-line text-text text-xs" id={`t-${a.id}`}>
                        <option value="">选择目标</option>
                        {targets.map((e) => (
                          <option key={e.cityId} value={e.cityId}>{cityName(e.cityId)}（守军 {fmt(e.garrison)}）</option>
                        ))}
                        {display.cities.filter((c) => c.cityId !== a.originCityId).map((c) => (
                          <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}（增援）</option>
                        ))}
                      </select>
                      <Btn
                        variant="orange"
                        disabled={busyArmyId === a.id}
                        onClick={() => {
                          const sel = document.getElementById(`t-${a.id}`) as HTMLSelectElement;
                          if (sel.value) march(a.id, sel.value);
                        }}
                        className="!py-1 text-xs"
                      >
                        出征
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {camps.length > 0 && (
          <Card title={`蛮族营地（${camps.length}）`}>
            <div className="text-xs text-muted mb-2">地图上的蛮族营地，可从任意己方城市攻打（无需接壤）。胜利获得人口与装备，有概率掉落神行符。</div>
            <div className="space-y-2">
              {camps.map((c) => {
                const host = cityName(c.hostCityId);
                return (
                  <div key={c.id} className="bg-panel2/60 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-orange">营地 · 近{host} · 守军 {fmt(c.garrison)}</span>
                      <button
                        className="text-gold hover:text-gold2 cursor-pointer"
                        onClick={() => {
                          selectCity(c.hostCityId);
                          useGame.getState().setView('map');
                        }}
                      >
                        地图查看
                      </button>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {idleGenerals.slice(0, 8).map((g) => {
                        const checked = selectedGeneralIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleGeneral(g.id)}
                            className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                              checked ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel border-line text-muted'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 items-center mt-1.5">
                      <input
                        type="number"
                        min={0}
                        max={pool.infantry}
                        value={infantry}
                        onChange={(e) => setInfantry(Number(e.target.value) || 0)}
                        aria-label="营地步兵"
                        className="w-24 h-8 px-2 rounded bg-bg border border-line text-text text-sm tabular"
                      />
                      <Btn
                        variant="orange"
                        disabled={busy || selectedGenerals.length === 0 || infantry <= 0}
                        onClick={async () => {
                          setBusy(true);
                          await mutate(() =>
                            api.barbarianAttack({
                              campId: c.id,
                              generalIds: selectedGenerals.map((g) => g.id),
                              name: armyName || undefined,
                              strategy,
                              infantry,
                              cavalry: 0,
                            })
                          );
                          setBusy(false);
                          setInfantry(0);
                          setSelectedGeneralIds([]);
                        }}
                        className="!py-1 text-xs"
                      >
                        攻打营地
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {marching.length > 0 && (
          <Card title={`行军中（${marching.length}）`}>
            <div className="space-y-2">
              {marching.map((a) => {
                const g = display.generals.find((x) => x.id === a.generalId);
                const departed = Date.parse(a.departedAt ?? '');
                const arrives = Date.parse(a.arrivesAt ?? '');
                const pct = Math.min(1, Math.max(0, (now - departed) / (arrives - departed)));
                const cancellable = now - departed < 60_000;
                return (
                  <div key={a.id} className="bg-panel2/60 rounded p-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{g?.name ?? '增援'} · {fmt(a.infantry + a.cavalry)} 人 → {cityName(a.targetCityId ?? '')}</span>
                      <span className="text-muted tabular">{fmtDur(Math.max(0, arrives - now))}</span>
                    </div>
                    <ProgressBar value={pct} max={1} color="bg-orange" />
                    <div className="flex justify-between items-center mt-1.5">
                      <span className="text-xs text-muted">{cancellable ? '出发 60 秒内可撤回' : '已超出撤回窗口'}</span>
                      <Btn variant="danger" disabled={!cancellable || busyArmyId === a.id} onClick={() => cancelMarch(a.id)} className="!py-0.5 !px-2 text-xs">
                        撤回
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {returning.length > 0 && (
          <Card title={`返回中（${returning.length}）`}>
            {returning.map((a) => {
              const g = display.generals.find((x) => x.id === a.generalId);
              const departed = Date.parse(a.departedAt ?? '');
              const arrives = Date.parse(a.arrivesAt ?? '');
              const pct = Math.min(1, Math.max(0, (now - departed) / (arrives - departed)));
              return (
                <div key={a.id} className="bg-panel2/60 rounded p-2 mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{g?.name} · 残部返回 {cityName(a.originCityId)}</span>
                    <span className="text-muted tabular">{fmtDur(Math.max(0, arrives - now))}</span>
                  </div>
                  <ProgressBar value={pct} max={1} color="bg-muted" />
                </div>
              );
            })}
          </Card>
        )}

        <Card title={`驻守中（${garrisoned.length}）`}>
          {garrisoned.length === 0 ? (
            <div className="text-xs text-muted py-1">暂无将领驻守的城市。占领城市后军队自动驻守。</div>
          ) : (
            <div className="space-y-1.5">
              {garrisoned.map((c) => {
                const g = display.generals.find((x) => x.id === c.generalId);
                return (
                  <div key={c.cityId} className="flex items-center justify-between text-xs bg-panel2/50 rounded px-2 py-1.5">
                    <span>
                      <span className="text-gold">{cityName(c.cityId)}</span> · {g?.name} · 步兵 {fmt(c.infantry)} · 骑兵 {fmt(c.cavalry)}
                    </span>
                    <button className="text-muted hover:text-text cursor-pointer" onClick={() => { selectCity(c.cityId); }}>
                      详情
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
