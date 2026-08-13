import { useMemo } from 'react';
import type { CityConfig } from '@timewar/shared';
import { canAttackClient, cities, cityName, nationalCities, provinceName, routes } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';

const PROVINCE_COLOR: Record<string, string> = {
  广东: '#1a2747',
  广西: '#16213c',
  海南: '#14203a',
};

function minMax(list: { x: number; y: number }[], pad: number) {
  const xs = list.map((c) => c.x);
  const ys = list.map((c) => c.y);
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  };
}

function viewBoxOf(box: { minX: number; maxX: number; minY: number; maxY: number }) {
  return `${box.minX} ${box.minY} ${box.maxX - box.minX} ${box.maxY - box.minY}`;
}

// 标签方向：右侧 85px 内有水平接近的城市时，标签改放左侧，避免重叠
function labelSide(c: { id: string; x: number; y: number }, all: { id: string; x: number; y: number }[]): 'left' | 'right' {
  for (const o of all) {
    if (o.id === c.id) continue;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    if (Math.abs(dy) < 30 && dx > 0 && dx < 85) return 'left';
  }
  return 'right';
}

function MarchMarkers({ now, display }: { now: number; display: import('@timewar/shared').GameState }) {
  const armies = display.armies.filter((a) => a.status === 'MARCHING' || a.status === 'RETURNING');
  return (
    <>
      {armies.map((army) => {
        const from = cities.find((c) => c.id === army.originCityId);
        const to = cities.find((c) => c.id === army.targetCityId) ?? from;
        if (!from || !to) return null;
        const departed = Date.parse(army.departedAt ?? '');
        const arrives = Date.parse(army.arrivesAt ?? '');
        const progress = arrives > departed ? Math.min(1, Math.max(0, (now - departed) / (arrives - departed))) : 0;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        const general = display.generals.find((g) => g.id === army.generalId);
        const crossProvince = from.provinceId !== (to?.provinceId ?? from.provinceId);
        return (
          <g key={army.id}>
            <circle cx={x} cy={y} r={7} fill="#e67e22" stroke="#0b1020" strokeWidth={2} />
            <text x={x} y={y - 14} textAnchor="middle" fill="#f0c96a" fontSize={14} fontWeight={600}>
              {general?.name ?? '增援'}·{army.infantry + army.cavalry}
              {crossProvince ? `→${to ? provinceName(to.provinceId) : ''}` : ''}
            </text>
          </g>
        );
      })}
    </>
  );
}

function NationalView({ display, now }: { display: import('@timewar/shared').GameState; now: number }) {
  const enterProvince = useGame((s) => s.enterProvince);
  const box = useMemo(() => minMax(nationalCities, 90), []);
  const playerProvinces = useMemo(() => {
    const set = new Set<string>();
    for (const c of display.cities) {
      const cfg = cities.find((x) => x.id === c.cityId);
      if (cfg) set.add(cfg.provinceId);
    }
    return set;
  }, [display]);

  const crossMarching = display.armies.filter(
    (a) => (a.status === 'MARCHING' || a.status === 'RETURNING') && a.originCityId && a.targetCityId
  );

  return (
    <svg viewBox={viewBoxOf(box)} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <text x={(box.minX + box.maxX) / 2} y={box.minY + 30} textAnchor="middle" fill="#8b96b3" fontSize={19} letterSpacing={6}>
        全国 · 点选省份进入
      </text>

      {/* 跨省行军（省中心插值） */}
      {crossMarching.map((army) => {
        const from = cities.find((c) => c.id === army.originCityId);
        const to = cities.find((c) => c.id === army.targetCityId);
        if (!from || !to) return null;
        const a = nationalCities.find((n) => n.id === from.provinceId);
        const b = nationalCities.find((n) => n.id === to.provinceId);
        if (!a || !b) return null;
        const departed = Date.parse(army.departedAt ?? '');
        const arrives = Date.parse(army.arrivesAt ?? '');
        const progress = arrives > departed ? Math.min(1, Math.max(0, (now - departed) / (arrives - departed))) : 0;
        const x = a.x + (b.x - a.x) * progress;
        const y = a.y + (b.y - a.y) * progress;
        const general = display.generals.find((g) => g.id === army.generalId);
        return (
          <g key={army.id}>
            <circle cx={x} cy={y} r={7} fill="#e67e22" stroke="#0b1020" strokeWidth={2} />
            <text x={x} y={y - 14} textAnchor="middle" fill="#f0c96a" fontSize={14} fontWeight={600}>
              {general?.name ?? '增援'} → {provinceName(to.provinceId)}
            </text>
          </g>
        );
      })}

      {/* 省级节点 */}
      {nationalCities.map((p) => {
        const player = playerProvinces.has(p.id);
        const provinceCityCount = cities.filter((c) => c.provinceId === p.id).length;
        const ownedInProvince = display.cities.filter((c) => cities.find((x) => x.id === c.cityId)?.provinceId === p.id).length;
        const complete = player && ownedInProvince >= provinceCityCount;
        const count = ownedInProvince;
        return (
          <g
            key={p.id}
            onClick={() => enterProvince(p.id)}
            className="cursor-pointer"
            data-province={p.id}
          >
            {/* 透明扩大点击区（移动端触摸 ≥44px） */}
            <circle cx={p.x} cy={p.y} r={22} fill="transparent" style={{ pointerEvents: 'all' }} />
            <circle
              cx={p.x}
              cy={p.y}
              r={player ? 13 : 11}
              fill={player ? '#d4a94e' : '#5b2a2a'}
              stroke={player ? '#f0c96a' : '#0b1020'}
              strokeWidth={2}
            />
            <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize={17} fontWeight={player ? 700 : 500} fill={player ? '#f0c96a' : '#8b96b3'}>
              {p.name}{complete ? ' ✓' : ''}
            </text>
            <text x={p.x} y={p.y + 45} textAnchor="middle" fontSize={12} fill={complete ? '#f0c96a' : '#6b7c9e'}>
              {player ? `已占 ${count}` : '未攻入'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MapView() {
  const display = useDisplay();
  const selectedCityId = useGame((s) => s.selectedCityId);
  const selectCity = useGame((s) => s.selectCity);
  const mapLevel = useGame((s) => s.mapLevel);
  const currentProvinceId = useGame((s) => s.currentProvinceId);
  const enterProvince = useGame((s) => s.enterProvince);
  const now = Date.now();

  const status = useMemo(() => {
    if (!display) return null;
    const playerSet = new Set(display.cities.map((c) => c.cityId));
    const attackable = new Set(
      cities.filter((c) => canAttackClient(display, c.id)).map((c) => c.id)
    );
    const marching = display.armies.filter((a) => a.status === 'MARCHING' || a.status === 'RETURNING');
    return { playerSet, attackable, marching };
  }, [display]);

  const provinceCities = useMemo(
    () => cities.filter((c) => c.provinceId === currentProvinceId),
    [currentProvinceId]
  );
  const box = useMemo(
    () => (provinceCities.length > 0 ? minMax(provinceCities, 70) : minMax(cities, 70)),
    [provinceCities]
  );

  if (!display || !status) return null;

  if (mapLevel === 'national') {
    return (
      <div className="h-full w-full bg-[#0d1526] overflow-hidden relative">
        <NationalView display={display} now={now} />
        {display.completedAt && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gold/90 text-[#1a1406] text-sm font-bold px-4 py-1.5 rounded-full">
            已统一全国！
          </div>
        )}
        <div className="absolute top-2 right-2 text-xs text-muted bg-panel/80 rounded px-2 py-1">
          已占领 {display.cities.length} / {cities.length} 城市
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0d1526] overflow-hidden relative">
      {/* 面包屑 */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 text-xs bg-panel/85 rounded px-2 py-1">
        <button className="text-muted hover:text-gold cursor-pointer" onClick={() => enterProvince(null)}>
          全国
        </button>
        <span className="text-muted">←</span>
        <span className="text-gold2">{provinceName(currentProvinceId ?? '')}</span>
        <span className="text-muted ml-2">已占 {provinceCities.filter((c) => status.playerSet.has(c.id)).length}/{provinceCities.length}</span>
      </div>

      <svg viewBox={viewBoxOf(box)} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* 省份底块 */}
        {(['广东', '广西', '海南'] as const).map((p) => {
          if (provinceName(currentProvinceId ?? '') !== p) return null;
          const cs = provinceCities;
          const minX = Math.min(...cs.map((c) => c.x)) - 30;
          const maxX = Math.max(...cs.map((c) => c.x)) + 30;
          const minY = Math.min(...cs.map((c) => c.y)) - 30;
          const maxY = Math.max(...cs.map((c) => c.y)) + 30;
          return (
            <rect key={p} x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx={16} fill={PROVINCE_COLOR[p]} opacity={0.55} />
          );
        })}

        {/* 省内路线 */}
        {routes.map((r) => {
          const a = cities.find((c) => c.id === r.from)!;
          const b = cities.find((c) => c.id === r.to)!;
          if (a.provinceId !== currentProvinceId || b.provinceId !== currentProvinceId) return null;
          const aP = status.playerSet.has(r.from);
          const bP = status.playerSet.has(r.to);
          const stroke = aP && bP ? '#d4a94e' : aP || bP ? '#7a5b1e' : '#2a3554';
          const dash = r.routeType === 'SEA' ? '6 6' : undefined;
          return (
            <line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={0.8} />
          );
        })}

        {/* 省内行军 */}
        <MarchMarkers now={now} display={display} />

        {/* 蛮族营地 */}
        {(display.barbarianCamps ?? []).map((camp) => (
          <g key={camp.id} className="cursor-pointer" onClick={() => useGame.getState().setView('armies')}>
            <circle cx={camp.x} cy={camp.y} r={8} fill="#7a3b1e" stroke="#e67e22" strokeWidth={1.5} className="pulse-ring" />
            <text x={camp.x} y={camp.y - 12} textAnchor="middle" fontSize={12} fill="#e67e22" fontWeight={600}>
              蛮族营地
            </text>
          </g>
        ))}

        {/* 城市节点 */}
        {provinceCities.map((c) => {
          const isPlayer = status.playerSet.has(c.id);
          const isAttackable = status.attackable.has(c.id);
          const isSelected = selectedCityId === c.id;
          const enemy = display.enemyCities.find((e) => e.cityId === c.id);
          const garrison = enemy?.garrison ?? 0;
          const isCapital = display.capitalCityId === c.id;
          const side = labelSide(c, provinceCities);
          const labelX = side === 'left' ? c.x - 13 : c.x + 13;
          const labelAnchor = side === 'left' ? 'end' : 'start';
          let fill = '#3a4568';
          let stroke = '#0b1020';
          if (isPlayer) {
            fill = '#d4a94e';
            stroke = '#f0c96a';
          } else if (isAttackable) {
            fill = '#c0392b';
            stroke = '#e67e22';
          } else {
            fill = '#5b2a2a';
          }
          const isVirtual = c.id === 'acity';
          return (
            <g key={c.id} onClick={() => selectCity(c.id)} className="cursor-pointer" data-city={c.id} data-tut={c.id === 'qingyuan' ? 'qingyuan' : undefined}>
              {/* 透明扩大点击区（移动端触摸 ≥44px） */}
              <circle cx={c.x} cy={c.y} r={22} fill="transparent" style={{ pointerEvents: 'all' }} />
              {isAttackable && <circle cx={c.x} cy={c.y} r={14} fill="none" stroke="#e67e22" className="pulse-ring" />}
              {isSelected && <circle cx={c.x} cy={c.y} r={15} fill="none" stroke="#f0c96a" strokeWidth={2} />}
              {isCapital && (
                <path d={`M ${c.x - 7} ${c.y - 10} l 3.5 -6 l 3.5 6 z`} fill="#f0c96a" stroke="#0b1020" strokeWidth={0.8} />
              )}
              <circle cx={c.x} cy={c.y} r={isPlayer ? 10 : 9} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={labelX} y={c.y + 4} textAnchor={labelAnchor} fontSize={16} fill={isPlayer ? '#f0c96a' : isAttackable ? '#e67e22' : '#8b96b3'} fontWeight={isPlayer ? 700 : 500}>
                {c.name}{isCapital ? '（首都）' : ''}
              </text>
              <text x={labelX} y={c.y + 21} textAnchor={labelAnchor} fontSize={12.5} fill="#6b7c9e">
                {isPlayer ? `Lv.${c.level}${isVirtual ? ' 虚拟城' : ''}` : `敌 ${garrison}`}
              </text>
            </g>
          );
        })}

        {/* 图例 */}
        <g transform={`translate(16, ${box.maxY - 40})`}>
          <circle cx={8} cy={-2} r={6} fill="#d4a94e" />
          <text x={20} y={2} fontSize={13} fill="#8b96b3">己方</text>
          <circle cx={76} cy={-2} r={6} fill="#c0392b" />
          <text x={88} y={2} fontSize={13} fill="#8b96b3">敌方</text>
          <circle cx={142} cy={-2} r={6} fill="none" stroke="#e67e22" className="pulse-ring" />
          <text x={154} y={2} fontSize={13} fill="#8b96b3">可进攻</text>
        </g>
      </svg>
      <div className="absolute top-2 right-2 text-xs text-muted bg-panel/80 rounded px-2 py-1">
        已占领 {display.cities.length} / {cities.length} 城市
      </div>
    </div>
  );
}
