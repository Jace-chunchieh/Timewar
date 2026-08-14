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
  const [busy, setBusy] = useState(false);
  const [busyArmyId, setBusyArmyId] = useState<string | null>(null);

  // 创建军团表单
  const [origin, setOrigin] = useState('acity');
  const [armyName, setArmyName] = useState('');
  const [bannerGeneralId, setBannerGeneralId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<'NORMAL' | 'DEFENSIVE' | 'CHARGE'>('NORMAL');
  const [infantry, setInfantry] = useState(200);
  const [cavalry, setCavalry] = useState(0);

  // 出征表单（按军团）
  const [marchTarget, setMarchTarget] = useState<Record<string, string>>({});
  const [marchTalisman, setMarchTalisman] = useState<Record<string, boolean>>({});

  if (!display || !state) return null;
  const now = Date.now();
  const pool = troopPoolClient(display);
  const idleGenerals = display.generals.filter((g) => g.status === 'IDLE');
  const bannerFlags = display.tech?.bannerFlags ?? 0;
  const speedUps = display.tech?.speedUps ?? 0;

  const toggleMember = (id: string) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= balance.maxGeneralsPerArmy ? prev : [...prev, id]
    );
  };

  const createArmy = async () => {
    const members = [...new Set([...memberIds, bannerGeneralId])].filter(Boolean);
    if (!armyName.trim() || !bannerGeneralId || members.length === 0 || infantry + cavalry <= 0) return;
    setBusy(true);
    const ok = await mutate(() =>
      api.armyCreate({
        originCityId: origin,
        name: armyName.trim(),
        bannerGeneralId,
        memberGeneralIds: members,
        strategy,
        infantry,
        cavalry,
      })
    );
    setBusy(false);
    if (ok) {
      setArmyName('');
      setBannerGeneralId('');
      setMemberIds([]);
      setInfantry(0);
      setCavalry(0);
    }
  };

  const armies = display.armies;

  const doMarch = async (armyId: string, target: string, useTalisman: boolean) => {
    setBusyArmyId(armyId);
    await mutate(() => api.armyMarch(armyId, target, useTalisman));
    setBusyArmyId(null);
  };

  const cancelMarch = async (armyId: string) => {
    setBusyArmyId(armyId);
    await mutate(() => api.armyCancelMarch(armyId));
    setBusyArmyId(null);
  };

  const useSpeedup = async (targetType: 'training' | 'army', targetId: string) => {
    setBusyArmyId(targetId);
    await mutate(() => api.useSpeedup(targetType, targetId));
    setBusyArmyId(null);
  };

  const addGeneral = async (armyId: string, generalId: string) => {
    await mutate(() => api.armyAddGeneral(armyId, generalId));
  };

  const removeGeneral = async (armyId: string, generalId: string) => {
    await mutate(() => api.armyRemoveGeneral(armyId, generalId));
  };

  const reinforce = async (armyId: string, inf: number, cav: number) => {
    await mutate(() => api.armyReinforce(armyId, inf, cav));
  };

  const selectedGenerals = [...new Set([...memberIds, bannerGeneralId])].filter(Boolean)
    .map((id) => display.generals.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);
  const cap = selectedGenerals.reduce((s, g) => s + commandCapClient(g.level, display), 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold2">军团</h2>
          <div className="text-xs text-muted">
            军团旗 <span className="text-gold tabular">{fmt(bannerFlags)}</span> · 加速符 <span className="text-orange tabular">{fmt(speedUps)}</span> · 士兵池 步{fmt(pool.infantry)}/骑{fmt(pool.cavalry)}
          </div>
        </div>

        {/* 组建军团（需军团旗 + 军团长） */}
        <Card title={`组建军团（消耗 1 面军团旗）`}>
          <div className="space-y-2.5">
            <div className="bg-panel2/60 rounded p-2 text-xs text-muted">
              军团永久存在；军团长不可更换（统帅 +50%），成员可加入/撤走（上限 {balance.maxGeneralsPerArmy} 人）；攻占城市后军团全体驻守当地。
            </div>
            <div className="grid md:grid-cols-2 gap-2.5">
              <Field label="军团番号">
                <input
                  value={armyName}
                  onChange={(e) => setArmyName(e.target.value)}
                  maxLength={8}
                  placeholder="如：虎啸营（≤8字）"
                  className="w-full h-8 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70"
                />
              </Field>
              <Field label="驻地">
                <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {display.cities.map((c) => (
                    <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
                  ))}
                </select>
              </Field>
              <Field label="军团长（不可更换）">
                <select className="w-full h-8 rounded bg-bg border border-line text-text text-sm" value={bannerGeneralId} onChange={(e) => setBannerGeneralId(e.target.value)}>
                  <option value="">选择军团长（空闲将领）</option>
                  {idleGenerals.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}（Lv.{g.level}）</option>
                  ))}
                </select>
              </Field>
              <Field label="军团成员（可多选）" hint={`${selectedGenerals.length}/${balance.maxGeneralsPerArmy}`}>
                <div className="flex flex-wrap gap-1.5">
                  {idleGenerals.map((g) => {
                    const checked = selectedGenerals.includes(g);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleMember(g.id)}
                        className={`px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
                          checked ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel2 border-line text-muted hover:text-text'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="步兵" hint={`池 ${fmt(pool.infantry)}`}>
                <NumInput value={infantry} onChange={setInfantry} max={pool.infantry} step={10} ariaLabel="军团步兵" />
              </Field>
              <Field label="骑兵" hint={`池 ${fmt(pool.cavalry)}`}>
                <NumInput value={cavalry} onChange={setCavalry} max={pool.cavalry} step={10} ariaLabel="军团骑兵" />
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
              <span className="text-muted">统帅占用</span>
              <span className="text-text tabular">{infantry + cavalry} / {cap}</span>
            </div>
            {bannerFlags < 1 && (
              <div className="text-orange text-xs">军团旗不足（科研院投入 ≥100 万人口后概率获得，无保底）</div>
            )}
            <Btn onClick={createArmy} disabled={busy || bannerFlags < 1 || !armyName.trim() || !bannerGeneralId || infantry + cavalry <= 0} className="w-full py-2">
              {busy ? '组建中…' : '组建军团（消耗 1 军团旗）'}
            </Btn>
          </div>
        </Card>

        {/* 军团列表 */}
        <Card title={`军团（${armies.length}）`}>
          {armies.length === 0 && (
            <div className="text-xs text-muted py-2">暂无军团。获得军团旗后组建第一支军团。</div>
          )}
          <div className="space-y-3">
            {armies.map((a) => {
              const banner = display.generals.find((g) => g.id === a.bannerGeneralId);
              const members = a.memberGeneralIds
                .map((id) => display.generals.find((g) => g.id === id))
                .filter((g): g is NonNullable<typeof g> => !!g);
              const attackableTargets = display.enemyCities.filter((e) => canAttackClient(display, e.cityId));
              const isFriendly = !!a.targetCityId && display.cities.some((c) => c.cityId === a.targetCityId);
              const target = marchTarget[a.id] ?? '';
              const useTalisman = marchTalisman[a.id] ?? false;
              const speedMul = 1 + (display.tech?.levels?.logistics ?? 0) * balance.tech.logistics.effectPerLevel;
              const routeTime = target
                ? (marchTimeClient(a.originCityId, target, a.infantry, a.cavalry, speedMul) ||
                    marchTimeFallbackClient(a.originCityId, target, a.infantry, a.cavalry, speedMul))
                : 0;
              const talismanNeed = target ? talismanCostClient(cityProvinceId(a.originCityId), cityProvinceId(target)) : 0;
              const expected = banner && target && display.enemyCities.some((e) => e.cityId === target)
                ? expectedBattle(display, banner.level, a.infantry, a.cavalry, target)
                : null;
              const departed = Date.parse(a.departedAt ?? '');
              const arrives = Date.parse(a.arrivesAt ?? '');
              const pct = arrives > departed ? Math.min(1, Math.max(0, (now - departed) / (arrives - departed))) : 0;
              const isStatic = a.status === 'IDLE' || a.status === 'GARRISON';
              const addTargets = idleGenerals.filter((g) => !a.memberGeneralIds.includes(g.id));
              return (
                <div key={a.id} className="bg-panel2/60 rounded p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-gold2">
                      🚩 {a.name}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {a.status === 'MARCHING' ? `行军中 → ${cityName(a.targetCityId ?? '')}` : a.status === 'RETURNING' ? '返回中' : a.status === 'GARRISON' ? `驻守 ${cityName(a.originCityId)}` : `驻地 ${cityName(a.originCityId)}`}
                      </span>
                    </div>
                    <span className="text-xs text-muted tabular">步 {fmt(a.infantry)} · 骑 {fmt(a.cavalry)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((g) => (
                      <span key={g.id} className={`px-2 py-0.5 rounded text-[11px] border ${g.id === a.bannerGeneralId ? 'bg-gold/20 border-gold text-gold2' : 'bg-panel border-line text-text'}`}>
                        {g.name} Lv.{g.level}
                        {g.id === a.bannerGeneralId ? ' 🚩军团长' : ''}
                        {isStatic && g.id !== a.bannerGeneralId && (
                          <button className="ml-1 text-danger hover:text-text cursor-pointer" onClick={() => removeGeneral(a.id, g.id)} title="撤走该将领">✕</button>
                        )}
                      </span>
                    ))}
                    {addTargets.length > 0 && isStatic && (
                      <select className="h-6 rounded bg-bg border border-line text-text text-[11px]" value="" onChange={(e) => e.target.value && addGeneral(a.id, e.target.value)}>
                        <option value="">+ 加入将领</option>
                        {addTargets.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}（Lv.{g.level}）</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {isStatic && (
                    <>
                      <div className="flex gap-2 items-center flex-wrap">
                        <select className="flex-1 min-w-[180px] h-8 rounded bg-bg border border-line text-text text-xs" value={target} onChange={(e) => setMarchTarget((m) => ({ ...m, [a.id]: e.target.value }))}>
                          <option value="">选择出征目标</option>
                          <optgroup label="可进攻的敌方城市">
                            {attackableTargets.map((e) => (
                              <option key={e.cityId} value={e.cityId}>{cityName(e.cityId)}（守军 {fmt(e.garrison)}）</option>
                            ))}
                          </optgroup>
                          {useTalisman && (
                            <optgroup label="全部敌方城市（神行符远征）">
                              {display.enemyCities.map((e) => (
                                <option key={e.cityId} value={e.cityId}>
                                  {cityName(e.cityId)}（{fmt(e.garrison)} · {talismanCostClient(cityProvinceId(a.originCityId), cityProvinceId(e.cityId))}张）
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="己方城市（增援）">
                            {display.cities.filter((c) => c.cityId !== a.originCityId).map((c) => (
                              <option key={c.cityId} value={c.cityId}>{cityName(c.cityId)}</option>
                            ))}
                          </optgroup>
                        </select>
                        <Btn variant="orange" disabled={!target || busyArmyId === a.id} onClick={() => doMarch(a.id, target, useTalisman)} className="!py-1 text-xs">
                          出征
                        </Btn>
                        {!target && (
                          <label className="flex items-center gap-1 text-[11px] text-muted">
                            <input type="checkbox" checked={useTalisman} onChange={(e) => setMarchTalisman((m) => ({ ...m, [a.id]: e.target.checked }))} className="accent-[#d4a94e]" />
                            神行符远征
                          </label>
                        )}
                      </div>
                      {routeTime > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">行军时间</span>
                          <span className="text-text tabular">{fmtDur(routeTime * 1000)}</span>
                        </div>
                      )}
                      {expected && <div className="text-xs text-muted">预计进攻战力 {fmt(expected.attackerPower)} · 敌防守 {fmt(expected.defenderPower)} · 胜率约 {Math.round(expected.winProbability * 100)}%</div>}
                      <div className="flex gap-2 items-center">
                        <Btn variant="ghost" onClick={() => reinforce(a.id, Math.min(100, pool.infantry), 0)} className="!py-1 text-xs" disabled={pool.infantry <= 0}>
                          补充 100 步兵
                        </Btn>
                        <Btn variant="ghost" onClick={() => reinforce(a.id, 0, Math.min(50, pool.cavalry))} className="!py-1 text-xs" disabled={pool.cavalry <= 0}>
                          补充 50 骑兵
                        </Btn>
                        <span className="text-[11px] text-muted">补充兵力从士兵池扣除</span>
                      </div>
                    </>
                  )}

                  {(a.status === 'MARCHING' || a.status === 'RETURNING') && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted">{a.status === 'MARCHING' ? '行军' : '返回'}进度</span>
                        <span className="text-muted tabular">{fmtDur(Math.max(0, arrives - now))}</span>
                      </div>
                      <ProgressBar value={pct} max={1} color="bg-orange" />
                      <div className="flex gap-2 mt-1.5 items-center">
                        {a.status === 'MARCHING' && now - departed <= balance.cancelMarchWindowSeconds * 1000 && (
                          <Btn variant="danger" onClick={() => cancelMarch(a.id)} className="!py-0.5 !px-2 text-xs">撤回</Btn>
                        )}
                        <Btn variant="ghost" disabled={speedUps < 1 || busyArmyId === a.id} onClick={() => useSpeedup('army', a.id)} className="!py-0.5 !px-2 text-xs">
                          使用加速符（-1小时）
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* 蛮族营地 */}
        {(display.barbarianCamps ?? []).length > 0 && (
          <Card title={`蛮族营地（${(display.barbarianCamps ?? []).length}）`}>
            <div className="text-xs text-muted mb-2">胜利获得人口与装备，有概率掉落神行符。请选择一支空闲军团前往讨伐。</div>
            <div className="space-y-2">
              {(display.barbarianCamps ?? []).map((c) => (
                <div key={c.id} className="bg-panel2/60 rounded p-2 flex items-center justify-between text-xs">
                  <span className="text-orange">营地 · 近{cityName(c.hostCityId)} · 守军 {fmt(c.garrison)}</span>
                  <div className="flex items-center gap-2">
                    <select id={`camp-army-${c.id}`} className="h-7 rounded bg-bg border border-line text-text text-xs">
                      <option value="">选择军团</option>
                      {armies.filter((a) => a.status === 'IDLE' || a.status === 'GARRISON').map((a) => (
                        <option key={a.id} value={a.id}>🚩 {a.name}</option>
                      ))}
                    </select>
                    <Btn
                      variant="orange"
                      className="!py-0.5 !px-2 text-xs"
                      onClick={async () => {
                        const sel = document.getElementById(`camp-army-${c.id}`) as HTMLSelectElement;
                        const army = armies.find((a) => a.id === sel.value);
                        if (!army) return;
                        setBusy(true);
                        await mutate(() =>
                          api.barbarianAttack({
                            campId: c.id,
                            bannerGeneralId: army.bannerGeneralId,
                            memberGeneralIds: army.memberGeneralIds,
                            strategy: army.strategy,
                            infantry: army.infantry,
                            cavalry: army.cavalry,
                          })
                        );
                        setBusy(false);
                      }}
                      disabled={busy}
                    >
                      讨伐
                    </Btn>
                    <button className="text-muted hover:text-gold cursor-pointer" onClick={() => { selectCity(c.hostCityId); useGame.getState().setView('map'); }}>
                      地图查看
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
