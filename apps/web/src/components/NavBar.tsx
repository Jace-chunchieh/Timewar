import { useGame, type View } from '../store';

const DESKTOP_NAV: { key: View; label: string }[] = [
  { key: 'map', label: '世界地图' },
  { key: 'production', label: '人口与生产' },
  { key: 'training', label: '训练' },
  { key: 'craft', label: '编军' },
  { key: 'tech', label: '科技研发' },
  { key: 'generals', label: '将领' },
  { key: 'armies', label: '军团' },
  { key: 'reports', label: '战报' },
  { key: 'settings', label: '设置' },
];

const MOBILE_NAV: { key: View; label: string }[] = [
  { key: 'map', label: '地图' },
  { key: 'production', label: '生产' },
  { key: 'training', label: '训练' },
  { key: 'armies', label: '军队' },
  { key: 'generals', label: '将领' },
];

export function DesktopNav() {
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const selectCity = useGame((s) => s.selectCity);
  const go = (v: View) => {
    setView(v);
    selectCity(null);
  };
  return (
    <nav className="hidden lg:flex w-40 shrink-0 border-r border-line bg-panel/60 py-3 flex-col gap-1 overflow-y-auto">
      {DESKTOP_NAV.map((item) => (
        <button
          key={item.key}
          onClick={() => go(item.key)}
          className={`text-left px-4 py-2 text-sm rounded-r-md border-l-2 transition-colors cursor-pointer ${
            view === item.key
              ? 'bg-panel2 border-gold text-gold2'
              : 'border-transparent text-muted hover:text-text hover:bg-panel2/60'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function MobileNav({ onMore }: { onMore: () => void }) {
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const selectCity = useGame((s) => s.selectCity);
  const go = (v: View) => {
    setView(v);
    selectCity(null);
  };
  return (
    <nav className="lg:hidden shrink-0 bg-panel border-t border-line flex items-stretch">
      {MOBILE_NAV.map((item) => (
        <button
          key={item.key}
          onClick={() => go(item.key)}
          className={`flex-1 py-2 text-xs border-b-2 transition-colors cursor-pointer ${
            view === item.key ? 'border-gold text-gold2' : 'border-transparent text-muted'
          }`}
        >
          {item.label}
        </button>
      ))}
      <button
        onClick={onMore}
        className={`flex-1 py-2 text-xs border-b-2 transition-colors cursor-pointer ${
          view === 'craft' || view === 'tech' || view === 'reports' || view === 'settings'
            ? 'border-gold text-gold2'
            : 'border-transparent text-muted'
        }`}
      >
        更多
      </button>
    </nav>
  );
}
