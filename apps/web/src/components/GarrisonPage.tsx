import { useDisplay } from '../hooks';
import { balance, cityName } from '../lib/game';
import { fmt } from '../lib/format';
import { useGame } from '../store';
import { Btn, Card } from './ui';

// 驻守总览：展示所有己方城市的驻军、驻守将领与驻守军团
export default function GarrisonPage() {
  const display = useDisplay();
  const selectCity = useGame((s) => s.selectCity);
  const setView = useGame((s) => s.setView);
  if (!display) return null;

  const generalOf = (id: string) => display.generals.find((g) => g.id === id);
  const armyAt = (cityId: string) =>
    display.armies.filter((a) => a.originCityId === cityId && (a.status === 'GARRISON' || a.status === 'IDLE'));

  const totalInfantry = display.cities.reduce((s, c) => s + c.infantry, 0);
  const totalCavalry = display.cities.reduce((s, c) => s + c.cavalry, 0);
  const garrisonedArmies = display.armies.filter((a) => a.status === 'GARRISON' || a.status === 'IDLE');
  const armyTroops = garrisonedArmies.reduce((s, a) => s + a.infantry + a.cavalry, 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold2">驻守总览</h2>
          <div className="text-xs text-muted">
            驻军 步{fmt(totalInfantry)}/骑{fmt(totalCavalry)} · 军团兵力 {fmt(armyTroops)}
          </div>
        </div>

        {display.cities.length === 0 && <div className="text-muted text-sm">暂无占领城市</div>}

        {display.cities.map((city) => {
          const army = armyAt(city.cityId);
          const generals = (city.generalIds ?? (city.generalId ? [city.generalId] : []))
            .map(generalOf)
            .filter((g): g is NonNullable<typeof g> => !!g);
          const isCapital = display.capitalCityId === city.cityId;
          const armyGenerals = army.flatMap((a) =>
            a.memberGeneralIds.map((id) => ({ army: a, general: generalOf(id) }))
          ).filter((x): x is { army: NonNullable<typeof x.army>; general: NonNullable<typeof x.general> } => !!x.general);

          return (
            <Card key={city.cityId} title={`${cityName(city.cityId)}${isCapital ? '（首都）' : ''} · Lv.${city.level}`}
              right={
                <button className="text-xs text-muted hover:text-gold cursor-pointer" onClick={() => { setView('map'); selectCity(city.cityId); }}>
                  地图查看 →
                </button>
              }
            >
              <div className="space-y-2">
                {/* 驻军 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-panel2/60 rounded p-2">
                    <div className="text-muted">驻军步兵</div>
                    <div className="text-base font-semibold text-gold tabular">{fmt(city.infantry)}</div>
                  </div>
                  <div className="bg-panel2/60 rounded p-2">
                    <div className="text-muted">驻军骑兵</div>
                    <div className="text-base font-semibold text-gold tabular">{fmt(city.cavalry)}</div>
                  </div>
                </div>

                {/* 驻守将领 */}
                <div>
                  <div className="text-xs text-muted mb-1">驻守将领（{generals.length}）</div>
                  {generals.length === 0 ? (
                    <div className="text-xs text-muted">无将领驻守</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {generals.map((g) => (
                        <span key={g.id} className="bg-panel border border-line rounded px-2 py-0.5 text-[11px] text-text">
                          {g.name} Lv.{g.level}
                          {g.status === 'TRAINING' && <span className="text-gold ml-1">训练中</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 驻守军团 */}
                <div>
                  <div className="text-xs text-muted mb-1">驻守军团（{army.length}）</div>
                  {army.length === 0 ? (
                    <div className="text-xs text-muted">无军团驻守（城市无驻军也不影响人口产出）</div>
                  ) : (
                    <div className="space-y-1.5">
                      {army.map((a) => {
                        const banner = generalOf(a.bannerGeneralId);
                        return (
                          <div key={a.id} className="bg-panel2/50 rounded p-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gold2 font-semibold">
                                🚩 {a.name}
                                <span className="ml-1.5 text-muted font-normal">
                                  {a.status === 'GARRISON' ? '驻守中' : '驻地整备'} · 兵力 {fmt(a.infantry)}/{fmt(a.cavalry)}
                                </span>
                              </span>
                              <span className="text-[11px] text-muted">军团长 {banner?.name}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {armyGenerals.filter((x) => x.army.id === a.id).map(({ general }) => (
                                <span key={general.id} className="bg-panel border border-line rounded px-1.5 py-0.5 text-[11px] text-text">
                                  {general.name}
                                  {general.id === a.bannerGeneralId && <span className="text-gold ml-0.5">🚩</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-muted pt-0.5">
                  人口产出：等级 {balance.populationPerCityPerInterval[String(city.level)] ?? 1}/10秒
                  {isCapital ? ' ×1.5（首都）' : ''}
                </div>
              </div>
            </Card>
          );
        })}

        <Btn variant="ghost" onClick={() => setView('armies')} className="w-full py-2">
          前往军团页管理驻守 →
        </Btn>
      </div>
    </div>
  );
}
