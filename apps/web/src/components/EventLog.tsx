import { fmtTime } from '../lib/format';
import { useGame } from '../store';

const KIND_COLOR: Record<string, string> = {
  battle: 'text-danger',
  capture: 'text-gold2',
  general: 'text-gold',
  info: 'text-muted',
  offline: 'text-orange',
  error: 'text-danger',
};

export default function EventLog() {
  const events = useGame((s) => s.events);
  const setView = useGame((s) => s.setView);
  return (
    <footer className="hidden lg:flex shrink-0 h-9 border-t border-line bg-panel/80 items-center gap-1 px-2 overflow-hidden">
      <span className="text-xs text-muted shrink-0">事件</span>
      <div className="flex items-center gap-4 overflow-hidden flex-1">
        {events.slice(0, 6).map((e) => (
          <span key={e.id} className="text-xs whitespace-nowrap tabular">
            <span className="text-muted">{fmtTime(new Date(e.time).toISOString()).slice(6)} </span>
            <span className={KIND_COLOR[e.kind]}>{e.text}</span>
          </span>
        ))}
      </div>
      <button className="text-xs text-muted hover:text-gold shrink-0 cursor-pointer" onClick={() => setView('reports')}>
        战报 →
      </button>
    </footer>
  );
}
