import { useState } from 'react';
import { api } from '../api';
import { balance } from '../lib/game';
import { useGame } from '../store';
import { Btn, Card } from './ui';

export default function SettingsPage() {
  const mutate = useGame((s) => s.mutate);
  const refresh = useGame((s) => s.refresh);
  const isAdmin = useGame((s) => s.isAdmin);
  const authName = useGame((s) => s.authName);
  const logout = useGame((s) => s.logout);
  const [confirming, setConfirming] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [codes, setCodes] = useState<{ code: string; name: string; isAdmin: boolean }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reset = async () => {
    await mutate(() => api.reset());
    setConfirming(false);
    localStorage.removeItem('timewar-offline-seen');
    window.location.reload();
  };

  const addCode = async () => {
    setMsg(null);
    const ok = await mutate(() => api.addCode(newCode.trim(), newName.trim() || newCode.trim()));
    if (ok) {
      setNewCode('');
      setNewName('');
      setMsg('授权码已创建');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const loadCodes = async () => {
    const { codes } = await api.listCodes();
    setCodes(codes);
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-gold2">设置</h2>

        <Card title="游戏规则">
          <div className="text-xs text-muted space-y-1">
            <div>· 初始城市为虚拟城市 A市（1级，位于广东）；每座城市每 10 秒按等级产出人口（1级+1…5级+5），A市 等级 = 你拥有的最高真实城市等级。</div>
            <div>· 人口可分配至武器（3000 工作量/件）、盔甲（4500）、战马（9000）生产，随时撤回；也分配到科研院研发神行符。</div>
            <div>· 普通人口训练 600 秒完成，1/10,000 概率成为将领；训练取消只返还 50%。</div>
            <div>· 步兵 = 训练人口 + 武器 + 盔甲；骑兵另需 1 战马。</div>
            <div>· 将领统帅 = (200 + (等级-1)×100) × (1 + 统帅之道)；训练每秒 1 经验（治军加成），升级需 300×等级²。</div>
            <div>· 只能进攻相邻敌方城市（省外需真实接壤）；骑兵攻城攻击 ×0.7、速度 ×1.8；海路时间 ×1.5。</div>
            <div>· 神行符：科研院投入 ≥10,000 人后每 10 秒判定获得（基础 0.01% + 每100人 0.001%）；出征消耗 1~N 张突破接壤（按省份间距）。</div>
            <div>· 科技树：攻城术/军驿/冶炼/军屯/治军/统帅之道/神行符强化，一次性人口升级永久生效。</div>
            <div>· 军团出发 60 秒内可撤回；战败幸存军队按 70% 行军时间返回。</div>
            <div>· 离线收益最多结算 {Math.floor(balance.offlineCapSeconds / 3600)} 小时。</div>
          </div>
        </Card>

        <Card title="账号">
          <div className="text-xs text-muted mb-2">
            当前授权码：<span className="text-gold tabular">{localStorage.getItem('timewar-code')}</span>
            {authName ? `（${authName}${isAdmin ? ' · 管理员' : ''}）` : ''}
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={logout}>退出登录</Btn>
          </div>
        </Card>

        {isAdmin && (
          <Card title="授权码管理（管理员）">
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="新授权码"
                  className="h-9 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70"
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="备注名（可选）"
                  className="h-9 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Btn onClick={addCode} disabled={!newCode.trim()}>新增授权码</Btn>
                <Btn variant="ghost" onClick={loadCodes}>查看列表</Btn>
                {msg && <span className="text-gold text-xs">{msg}</span>}
              </div>
              {codes && (
                <div className="bg-panel2/50 rounded p-2 space-y-1 text-xs max-h-48 overflow-y-auto">
                  {codes.map((c) => (
                    <div key={c.code} className="flex justify-between">
                      <span className="text-text tabular">{c.code}</span>
                      <span className="text-muted">{c.name}{c.isAdmin ? '（管理员）' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-muted">每位授权码拥有独立存档，互不影响。</div>
            </div>
          </Card>
        )}

        <Card title="存档">
          <div className="text-xs text-muted mb-2">游戏自动保存至服务端 SQLite（当前授权码独立存档）。重置将清除本授权码的全部进度并开始新游戏。</div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => refresh()}>立即保存</Btn>
            {!confirming ? (
              <Btn variant="danger" onClick={() => setConfirming(true)}>重置存档</Btn>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-danger">确认重置？</span>
                <Btn variant="danger" onClick={reset}>确认</Btn>
                <Btn variant="ghost" onClick={() => setConfirming(false)}>取消</Btn>
              </div>
            )}
          </div>
        </Card>

        <Card title="关于">
          <div className="text-xs text-muted space-y-1">
            <div>TimeWar · 现实时间人口战争 MVP v1.0.0</div>
            <div>广东（21）/ 广西（14）/ 海南（9）共 44 个城市节点</div>
            <div>数据文件：data/cities.json、data/routes.json、data/game-balance.json</div>
            <div>服务端权威结算，前端仅负责展示与预览。</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
