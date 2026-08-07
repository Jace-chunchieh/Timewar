export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

export function fmtBig(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${trim((n / 1e8).toFixed(2))}亿`;
  if (abs >= 1e4) return `${trim((n / 1e4).toFixed(2))}万`;
  return fmt(n);
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, '');
}

export function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
