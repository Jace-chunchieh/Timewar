import { fmt, fmtBig } from '../lib/format';
import { balance, cities, populationRate } from '../lib/game';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Stat } from './ui';

export default function TopBar() {
  const display = useDisplay();
  const setView = useGame((s) => s.setView);
  const selectCity = useGame((s) => s.selectCity);
  const serverVersion = useGame((s) => s.serverVersion);
  if (!display) return null;
  const r = display.resources;
  const rate = populationRate(display);
  const openProduction = () => {
    setView('production');
    selectCity(null);
  };
  return (
    <header className="shrink-0 bg-panel/95 border-b border-line px-2 py-1.5">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <div className="hidden md:flex items-center gap-2 pr-2 mr-1 border-r border-line">
          <div className="text-gold font-bold tracking-wider whitespace-nowrap">TIME WAR</div>
          <div className="text-xs text-muted whitespace-nowrap">现实时间人口战争</div>
        </div>
        <div data-tut="population" className="flex items-center gap-1">
          <Stat label="人口" value={fmtBig(r.idlePopulation)} sub={`+${fmt(rate)}/10秒`} onClick={openProduction} />
        </div>
        <Stat label="武器" value={fmtBig(r.weapons)} onClick={openProduction} />
        <Stat label="盔甲" value={fmtBig(r.armors)} onClick={openProduction} />
        <Stat label="战马" value={fmtBig(r.horses)} onClick={openProduction} />
        <Stat
          label="训练后人口"
          value={fmtBig(r.trainedPopulation)}
          sub={display.trainingBatches.length > 0 ? `训练中 ${display.trainingBatches.reduce((s, b) => s + b.count, 0)}` : undefined}
          onClick={() => { setView('training'); selectCity(null); }}
        />
        <Stat
          label="神行符"
          value={fmt(display.tech.talismans)}
          sub={display.tech.researchWorkers > 0 ? `研究 ${fmt(display.tech.researchWorkers)}` : undefined}
          onClick={() => { setView('tech'); selectCity(null); }}
        />
        <Stat
          label="城市"
          value={`${display.cities.length}/${cities.length}`}
          sub={display.armies.filter((a) => a.status === 'MARCHING' || a.status === 'RETURNING').length > 0 ? `行军中 ${display.armies.filter((a) => a.status === 'MARCHING').length}` : undefined}
          onClick={() => { setView('map'); selectCity(null); }}
        />
        <div className="ml-auto hidden sm:flex items-center gap-3 whitespace-nowrap">
          <span
            className="text-xs text-muted tabular cursor-default"
            title={`服务端应用版本 ${serverVersion?.app ?? '未知'} · 存档结构版本 ${serverVersion?.schema ?? '未知'}\n部署版本确认：对比 GitHub Timewar 仓库 main 分支 package.json 版本`}
          >
            v{serverVersion?.app ?? '…'}
            {serverVersion ? <span className="text-muted/60 ml-1">存档 v{serverVersion.schema}</span> : null}
          </span>
          <span className="text-xs text-muted">离线收益上限 {fmt(Math.floor(balance.offlineCapSeconds / 3600))} 小时</span>
        </div>
      </div>
    </header>
  );
}
