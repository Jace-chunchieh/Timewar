import { useCallback, useEffect, useState } from 'react';
import { api, type MailItem } from '../api';
import { fmt } from '../lib/format';
import { useGame } from '../store';
import { useDisplay } from '../hooks';
import { Btn, Card, Field } from './ui';

const ITEM_LABELS: Record<string, string> = {
  banner: '军团旗',
  talisman: '神行符',
  speedup: '加速符',
  population: '人口',
  weapons: '武器',
  armors: '盔甲',
  horses: '战马',
};

export default function MailPage() {
  const display = useDisplay();
  const mutate = useGame((s) => s.mutate);
  const isAdmin = useGame((s) => s.isAdmin);
  const [mails, setMails] = useState<MailItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  // GM 发奖表单
  const [toCode, setToCode] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [itemType, setItemType] = useState('banner');
  const [itemAmount, setItemAmount] = useState(2);

  const load = useCallback(async () => {
    const { mails } = await api.mailList();
    setMails(mails);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (mailId: string) => {
    setBusy(true);
    const ok = await mutate(() => api.claimMail(mailId));
    setBusy(false);
    if (ok) await load();
  };

  const gmSend = async () => {
    if (!toCode.trim() || !title.trim()) return;
    setBusy(true);
    const ok = await mutate(() =>
      api.gmSendMail({
        toCode: toCode.trim(),
        title: title.trim(),
        body: body.trim() || undefined,
        itemType: itemType || undefined,
        itemAmount,
      })
    );
    setBusy(false);
    if (ok) {
      setToCode('');
      setTitle('');
      setBody('');
    }
  };

  const unclaimed = (mails ?? []).filter((m) => !m.claimed).length;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold2">游戏内邮箱</h2>
          <div className="text-xs text-muted">
            {mails === null ? '加载中…' : `共 ${mails.length} 封 · 未领取 ${unclaimed} 封`}
          </div>
        </div>

        {isAdmin && (
          <Card title="GM 发奖（管理员）">
            <div className="space-y-2.5">
              <div className="grid md:grid-cols-2 gap-2.5">
                <Field label="收件授权码">
                  <input value={toCode} onChange={(e) => setToCode(e.target.value)} placeholder="如 ainiyiwannian"
                    className="w-full h-8 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70 tabular" />
                </Field>
                <Field label="邮件标题">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：GM 奖励"
                    className="w-full h-8 px-2 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70" />
                </Field>
                <Field label="奖励类型">
                  <select value={itemType} onChange={(e) => setItemType(e.target.value)}
                    className="w-full h-8 rounded bg-bg border border-line text-text text-sm">
                    <option value="banner">军团旗</option>
                    <option value="talisman">神行符</option>
                    <option value="speedup">加速符</option>
                    <option value="population">人口</option>
                    <option value="weapons">武器</option>
                    <option value="armors">盔甲</option>
                    <option value="horses">战马</option>
                    <option value="">无附件</option>
                  </select>
                </Field>
                <Field label="数量">
                  <input type="number" min={0} value={itemAmount} onChange={(e) => setItemAmount(Number(e.target.value) || 0)}
                    className="w-full h-8 px-2 rounded bg-bg border border-line text-text text-sm tabular" />
                </Field>
              </div>
              <Field label="邮件内容（可选）">
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
                  className="w-full px-2 py-1 rounded bg-bg border border-line text-text text-sm outline-none focus:border-gold/70" />
              </Field>
              <Btn onClick={gmSend} disabled={busy || !toCode.trim() || !title.trim()} className="w-full py-2">
                发送邮件
              </Btn>
            </div>
          </Card>
        )}

        {mails === null ? (
          <div className="text-muted text-sm">加载中…</div>
        ) : mails.length === 0 ? (
          <div className="text-muted text-sm py-8 text-center">邮箱空空如也，等待 GM 的邮件。</div>
        ) : (
          <div className="space-y-2">
            {mails.map((m) => (
              <Card key={m.id} title={m.title}
                right={
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted tabular">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                    {m.claimed ? (
                      <span className="text-xs text-muted border border-line px-2 py-0.5 rounded-full">已领取</span>
                    ) : (
                      <Btn onClick={() => claim(m.id)} disabled={busy} className="!py-0.5 !px-2 text-xs">
                        领取
                      </Btn>
                    )}
                  </div>
                }
              >
                <div className="space-y-1.5 text-xs">
                  <div className="text-muted">发件人：{m.fromCode === 'GM' ? 'GM（系统）' : m.fromCode}</div>
                  {m.body && <div className="text-text">{m.body}</div>}
                  {m.itemType && m.itemAmount > 0 && (
                    <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-gold inline-block">
                      附件：{ITEM_LABELS[m.itemType] ?? m.itemType} × {fmt(m.itemAmount)}
                      {m.claimed && <span className="text-muted ml-1">（已领取）</span>}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="text-[11px] text-muted pb-4">
          {display ? `当前账号：${localStorage.getItem('timewar-code')}` : ''}
        </div>
      </div>
    </div>
  );
}
