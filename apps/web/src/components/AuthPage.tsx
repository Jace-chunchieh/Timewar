import { useState } from 'react';
import { api } from '../api';
import { useGame } from '../store';
import { Btn } from './ui';

// 授权码登录页
export default function AuthPage() {
  const login = useGame((s) => s.login);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    const ok = await login(code.trim());
    setBusy(false);
    if (!ok) setErr('授权码无效，请联系管理员获取');
  };

  return (
    <div className="h-full flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm bg-panel border border-gold/40 rounded-xl p-6 rise-in">
        <div className="text-center mb-5">
          <div className="text-2xl font-bold text-gold tracking-[0.3em]">TIME WAR</div>
          <div className="text-xs text-muted mt-1">现实时间人口战争 · 授权码登录</div>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入授权码"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full h-11 px-3 rounded-lg bg-bg border border-line text-text text-sm outline-none focus:border-gold/70"
          />
          {err && <div className="text-danger text-xs">{err}</div>}
          <Btn onClick={submit} disabled={busy || !code.trim()} className="w-full py-2.5">
            {busy ? '登录中…' : '进入游戏'}
          </Btn>
          <div className="text-[11px] text-muted text-center pt-1">
            每位玩家使用独立授权码，存档相互隔离
          </div>
        </div>
      </div>
    </div>
  );
}
