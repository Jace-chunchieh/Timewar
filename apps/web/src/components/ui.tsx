import type { ReactNode } from 'react';

export function Btn({
  children,
  onClick,
  variant = 'gold',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'gold' | 'ghost' | 'danger' | 'orange';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const styles: Record<string, string> = {
    gold: 'bg-gold text-[#1a1406] hover:bg-gold2 disabled:opacity-40',
    ghost: 'bg-panel2 border border-line text-text hover:border-gold/60 disabled:opacity-40',
    danger: 'bg-danger/20 border border-danger/60 text-danger hover:bg-danger/30 disabled:opacity-40',
    orange: 'bg-orange/20 border border-orange/60 text-orange hover:bg-orange/30 disabled:opacity-40',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({
  value,
  max,
  color = 'bg-gold',
  className = '',
  height = 'h-2',
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full ${height} bg-line/60 rounded-full overflow-hidden ${className}`}>
      <div className={`${height} ${color} rounded-full transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`bg-panel border border-line rounded-lg p-3 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gold2">{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-1.5 rounded-md bg-panel border border-line min-w-[92px] ${onClick ? 'hover:border-gold/60 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-semibold text-text tabular">{value}</div>
      {sub && <div className="text-xs text-gold tabular">{sub}</div>}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        {hint && <span className="text-xs text-muted tabular">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function NumInput({
  value,
  onChange,
  max,
  min = 0,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  min?: number;
  step?: number;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`${ariaLabel ?? ''}减`}
        className="w-8 h-8 rounded bg-panel2 border border-line text-gold disabled:opacity-30 cursor-pointer"
        disabled={value - step < min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <input
        type="number"
        aria-label={ariaLabel}
        className="w-full min-w-0 h-8 px-2 rounded bg-bg border border-line text-text text-sm tabular outline-none focus:border-gold/70 text-right"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))}
      />
      <button
        type="button"
        aria-label={`${ariaLabel ?? ''}加`}
        className="w-8 h-8 rounded bg-panel2 border border-line text-gold disabled:opacity-30 cursor-pointer"
        disabled={max !== undefined && value + step > max}
        onClick={() => onChange(Math.min(max ?? Infinity, value + step))}
      >
        +
      </button>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-h-[72vh] overflow-y-auto bg-panel border-t border-line rounded-t-xl rise-in pb-8">
        <div className="sticky top-0 bg-panel px-4 py-3 flex items-center justify-between border-b border-line">
          <div className="font-semibold text-gold2">{title}</div>
          <button className="text-muted px-2" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
