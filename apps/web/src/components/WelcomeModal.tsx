import { useState } from 'react';
import { api } from '../api';
import { cities } from '../lib/game';
import { useGame } from '../store';
import { Btn } from './ui';

// 首次登录欢迎弹窗：新存档（welcomeShown=false）时展示一次
export default function WelcomeModal() {
  const state = useGame((s) => s.state);
  const mutate = useGame((s) => s.mutate);
  const [busy, setBusy] = useState(false);

  if (!state || state.welcomeShown) return null;

  const start = async () => {
    setBusy(true);
    await mutate(() => api.ackWelcome());
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-panel border border-gold/50 rounded-xl p-6 rise-in max-h-[85vh] overflow-y-auto">
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-gold tracking-[0.3em]">TIME WAR</div>
          <div className="text-sm text-muted mt-1">现实时间人口战争</div>
        </div>

        <div className="text-sm text-text leading-relaxed space-y-2.5">
          <p>
            你从虚拟城市 <span className="text-gold">A市</span>（位于广东，广州与深圳之间）起家。
            城市每 10 秒按等级产出人口，随着你占领更多城市，人口增长越来越快。
          </p>
          <p>
            把人口投入 <span className="text-gold">武器 / 盔甲 / 战马</span> 生产、军事训练与科技研发，
            合成步兵与骑兵，由将领率军攻占全国 <span className="text-gold">{cities.length} 座城市</span>——
            从广东省出发，逐步打通真实省界，直至统一全国。
          </p>
          <p>
            离线也会继续产出：每次回归都能看到离线收益报告。
          </p>
        </div>

        <div className="mt-4 bg-panel2/60 rounded-lg p-3 text-xs text-muted space-y-1">
          <div>· 新手引导：按提示完成第一次进攻（清远，守军 100）</div>
          <div>· 现实时间结算：关闭页面离开多久，回来就结算多久</div>
          <div>· 存档自动保存至服务器（SQLite）</div>
        </div>

        <Btn onClick={start} disabled={busy} className="w-full py-2.5 mt-5 text-base">
          {busy ? '进入中…' : '开始游戏'}
        </Btn>
      </div>
    </div>
  );
}
