import { useEffect, useState } from 'react';
import ArmiesPage from './components/ArmiesPage';
import AuthPage from './components/AuthPage';
import CityPanel from './components/CityPanel';
import CraftPage from './components/CraftPage';
import EventLog from './components/EventLog';
import GarrisonPage from './components/GarrisonPage';
import GeneralsPage from './components/GeneralsPage';
import MapView from './components/MapView';
import { DesktopNav, MobileNav } from './components/NavBar';
import OfflineReportModal from './components/OfflineReportModal';
import ProductionPage from './components/ProductionPage';
import ReportsPage from './components/ReportsPage';
import SettingsPage from './components/SettingsPage';
import TechPage from './components/TechPage';
import TopBar from './components/TopBar';
import TrainingPage from './components/TrainingPage';
import Tutorial from './components/Tutorial';
import WelcomeModal from './components/WelcomeModal';

// 全局错误提示条：所有 API 失败都会在此可见（自动消失）
function ErrorToast() {
  const error = useGame((s) => s.error);
  if (!error) return null;
  return (
    <div className="fixed top-14 inset-x-0 z-[70] flex justify-center px-3 pointer-events-none">
      <div className="bg-danger/95 text-white text-sm rounded-lg px-4 py-2 shadow-lg rise-in max-w-md text-center">
        {error}
      </div>
    </div>
  );
}
import { useGame } from './store';

export default function App() {
  const state = useGame((s) => s.state);
  const loading = useGame((s) => s.loading);
  const error = useGame((s) => s.error);
  const authed = useGame((s) => s.authed);
  const view = useGame((s) => s.view);
  const selectedCityId = useGame((s) => s.selectedCityId);
  const init = useGame((s) => s.init);
  const refresh = useGame((s) => s.refresh);
  const [moreOpen, setMoreOpen] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const timer = setInterval(() => useGame.setState({ tick: Date.now() }), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => refresh(), 5000);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    setCitySheetOpen(false);
  }, [view]);

  if (!authed) {
    return <AuthPage />;
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
        <div className="text-2xl text-gold font-bold tracking-widest">TIME WAR</div>
        <div className="text-sm">现实时间人口战争 · 正在载入存档…</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
        <div className="text-2xl text-gold font-bold tracking-widest">TIME WAR</div>
        <div className="text-sm">{error ?? '无法连接服务器'}</div>
        <button className="px-4 py-2 bg-gold text-black rounded-md text-sm" onClick={init}>
          重试
        </button>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'production':
        return <ProductionPage />;
      case 'training':
        return <TrainingPage />;
      case 'craft':
        return <CraftPage />;
      case 'tech':
        return <TechPage />;
      case 'generals':
        return <GeneralsPage />;
      case 'armies':
        return <ArmiesPage />;
      case 'garrison':
        return <GarrisonPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'map':
      default:
        return <MapView />;
    }
  };

  const selectedCity = selectedCityId && state.cities.some((c) => c.cityId === selectedCityId)
    || selectedCityId && state.enemyCities.some((e) => e.cityId === selectedCityId)
    ? selectedCityId
    : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TopBar />
      <ErrorToast />
      <div className="flex-1 flex min-h-0">
        <DesktopNav />
        <main className="flex-1 min-w-0 relative">{renderView()}</main>
        {/* 桌面端右侧详情面板 */}
        <aside className="hidden lg:block w-[340px] xl:w-[380px] shrink-0 border-l border-line bg-panel/40 overflow-y-auto">
          {view === 'map' && selectedCity ? (
            <CityPanel cityId={selectedCity} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted p-4">
              在地图上点击城市查看详情与出征
            </div>
          )}
        </aside>
      </div>
      <EventLog />
      <MobileNav onMore={() => setMoreOpen(true)} />

      {/* 移动端城市详情底部抽屉 */}
      {view === 'map' && selectedCity && (
        <div className="lg:hidden">
          <button
            className="fixed bottom-16 inset-x-0 mx-auto w-[min(92vw,400px)] bg-gold text-[#1a1406] rounded-full py-2 text-sm font-semibold shadow-lg z-30"
            onClick={() => setCitySheetOpen(true)}
          >
            查看城市 · 出征
          </button>
        </div>
      )}
      {view === 'map' && selectedCity && citySheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCitySheetOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 max-h-[80vh] overflow-y-auto bg-panel border-t border-line rounded-t-xl rise-in pb-8">
            <div className="sticky top-0 bg-panel px-4 py-2 flex items-center justify-between border-b border-line">
              <div className="text-sm font-semibold text-gold2">城市详情</div>
              <button className="text-muted px-2 text-sm" onClick={() => setCitySheetOpen(false)}>✕</button>
            </div>
            <CityPanel cityId={selectedCity} />
          </div>
        </div>
      )}

      {/* 移动端更多菜单 */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-panel border-t border-line rounded-t-xl p-4 rise-in pb-8">
            <div className="text-sm font-semibold text-gold2 mb-3">更多</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['craft', '编军'],
                ['tech', '科技研发'],
                ['garrison', '驻守总览'],
                ['reports', '战报'],
                ['settings', '设置'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className="bg-panel2 border border-line rounded-lg py-3 text-sm text-text cursor-pointer"
                  onClick={() => {
                    setMoreOpen(false);
                    useGame.getState().setView(key);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <OfflineReportModal />
      <WelcomeModal />
      <Tutorial />
    </div>
  );
}
