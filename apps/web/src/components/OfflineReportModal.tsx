import { fmt, fmtDur } from '../lib/format';
import { useGame } from '../store';
import { Btn } from './ui';

export default function OfflineReportModal() {
  const state = useGame((s) => s.state);
  const offlineSeenId = useGame((s) => s.offlineSeenId);
  const dismiss = useGame((s) => s.dismissOffline);
  const report = state?.offlineReport;
  if (!report || report.id === offlineSeenId) return null;
  const row = (label: string, value: string, highlight = false) => (
    <div className="flex justify-between items-center py-1.5 border-b border-line/40 last:border-0">
      <span className="text-muted text-sm">{label}</span>
      <span className={`tabular ${highlight ? 'text-gold2 font-semibold' : 'text-text'}`}>{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-panel border border-gold/40 rounded-xl p-5 rise-in">
        <div className="text-center mb-1">
          <div className="text-xl font-bold text-gold2">离线报告</div>
          <div className="text-xs text-muted mt-1">离线 {fmtDur(report.offlineMs)}（超过 24 小时只结算 24 小时）</div>
        </div>
        <div className="mt-3">
          {row('新增人口', fmt(report.populationGained), true)}
          {row('制造武器', fmt(report.weaponsProduced))}
          {row('制造盔甲', fmt(report.armorsProduced))}
          {row('获得战马', fmt(report.horsesProduced))}
          {row('完成训练人口', fmt(report.trainedCompleted))}
          {row('新产生将领', fmt(report.generalsCreated), report.generalsCreated > 0)}
          {row('将领获得经验', fmt(report.generalXpGained))}
          {row('完成行军', fmt(report.marchesCompleted))}
          {report.battleCount > 0 && row('战斗', `${report.victories} 胜 / ${report.defeats} 负`)}
          {row('新占领城市', fmt(report.citiesCaptured), report.citiesCaptured > 0)}
        </div>
        <Btn onClick={dismiss} className="w-full mt-4 py-2">确认</Btn>
      </div>
    </div>
  );
}
