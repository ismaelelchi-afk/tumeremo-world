import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { formatNumber } = useI18n();
  const digits = Number.isInteger(step) ? 0 : step < 0.1 ? 2 : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label !mb-0">{label}</label>
        <span className="text-[12.5px] font-semibold tabular-nums">
          {formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[40px] w-full items-center justify-between rounded-xl px-3"
      style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
    >
      <span className="text-[13.5px] font-semibold">{label}</span>
      <span className="relative h-6 w-11 rounded-full transition-colors" style={{ background: on ? 'var(--accent)' : 'var(--border)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
      </span>
    </button>
  );
}
