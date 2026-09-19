/**
 * Interface primitives.
 *
 * Deliberately small and unrounded. The 3D view is the subject, so the chrome
 * is built from hairlines and flat glass rather than cards and shadows, and
 * every numeric readout is monospaced so columns of figures line up.
 */

import type { ReactNode } from 'react';
import type { Provenance } from '../../types';

// ---------------------------------------------------------------------------
// provenance
// ---------------------------------------------------------------------------

const PROVENANCE_STYLE: Record<Provenance, { label: string; color: string; title: string }> = {
  measured: {
    label: 'MEASURED',
    color: 'var(--measured)',
    title: 'Read directly from the FlyWire 783 datasets in data/.',
  },
  simulated: {
    label: 'SIMULATED',
    color: 'var(--simulated)',
    title: "Produced by running the repository's spiking network model.",
  },
  derived: {
    label: 'DERIVED',
    color: 'var(--derived)',
    title: 'Computed by this application from measured data.',
  },
  approximation: {
    label: 'APPROX',
    color: 'var(--approx)',
    title: 'Illustrative geometry. No data behind it.',
  },
};

/**
 * The badge that keeps the application honest.
 *
 * Every figure on screen carries one. The four categories are also
 * distinguished by their text, not only by colour, so the distinction survives
 * for colour-blind readers and in greyscale.
 */
export function ProvenanceBadge({
  kind,
  compact = false,
}: {
  kind: Provenance;
  compact?: boolean;
}) {
  const style = PROVENANCE_STYLE[kind];
  return (
    <span
      title={style.title}
      className="num inline-flex items-center gap-1 px-1 py-px border"
      style={{
        color: style.color,
        borderColor: `color-mix(in srgb, ${style.color} 35%, transparent)`,
        background: `color-mix(in srgb, ${style.color} 8%, transparent)`,
        fontSize: compact ? 8 : 9,
        letterSpacing: '0.08em',
        lineHeight: 1.5,
      }}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function Section({
  title,
  provenance,
  actions,
  children,
  dense = false,
}: {
  title: string;
  provenance?: Provenance;
  actions?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="hair-b" style={{ padding: dense ? '10px 12px' : '12px 12px 14px' }}>
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="label truncate">{title}</h2>
          {provenance && <ProvenanceBadge kind={provenance} compact />}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Label/value row. The workhorse of every inspector. */
export function Row({
  label,
  value,
  title,
  mono = true,
  accent,
}: {
  label: string;
  value: ReactNode;
  title?: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]" title={title}>
      <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>{label}</span>
      <span
        className={mono ? 'num' : ''}
        style={{
          color: accent ?? 'var(--ink)',
          fontSize: 12,
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Large figure with a caption. Used in the analytics column. */
export function Stat({
  label,
  value,
  unit,
  accent,
  title,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  accent?: string;
  title?: string;
}) {
  return (
    <div title={title} className="min-w-0">
      <div className="label mb-[2px] truncate">{label}</div>
      <div className="num flex items-baseline gap-1" style={{ color: accent ?? 'var(--ink)' }}>
        <span style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.02em' }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{unit}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Shown wherever the datasets genuinely have nothing.
 *
 * Used instead of a zero or a dash, because "0 Hz" and "no data exists" are
 * completely different claims and the interface must not blur them.
 */
export function Unavailable({ reason }: { reason?: string }) {
  return (
    <span
      className="num"
      title={reason}
      style={{
        color: 'var(--ink-faint)',
        fontSize: 11,
        borderBottom: '1px dotted var(--hairline-strong)',
        cursor: reason ? 'help' : 'default',
      }}
    >
      Data unavailable
    </span>
  );
}

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  full,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  title?: string;
  full?: boolean;
  active?: boolean;
}) {
  const palette = {
    default: { bg: 'rgba(148,176,214,0.07)', border: 'var(--hairline-strong)', fg: 'var(--ink)' },
    primary: { bg: 'rgba(53,208,192,0.14)', border: 'rgba(53,208,192,0.5)', fg: 'var(--measured)' },
    danger: { bg: 'rgba(242,99,126,0.12)', border: 'rgba(242,99,126,0.45)', fg: 'var(--inhibitory)' },
    ghost: { bg: 'transparent', border: 'transparent', fg: 'var(--ink-dim)' },
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="num transition-colors"
      style={{
        background: active ? 'rgba(125,211,252,0.16)' : palette.bg,
        border: `1px solid ${active ? 'var(--focus)' : palette.border}`,
        color: active ? 'var(--focus)' : palette.fg,
        padding: '5px 9px',
        fontSize: 10,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="label">{label}</span>
        {hint && (
          <span className="num" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center"
      style={{ border: '1px solid var(--hairline)', background: 'rgba(0,0,0,0.3)' }}
    >
      <input
        type="number"
        className="num flex-1 bg-transparent px-2 py-1 outline-none"
        style={{ fontSize: 12, color: 'var(--ink)', minWidth: 0 }}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix && (
        <span className="num pr-2" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  marks,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  marks?: string[];
}) {
  return (
    <div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks && (
        <div className="flex justify-between mt-[3px]">
          {marks.map((m) => (
            <span key={m} className="num" style={{ fontSize: 8.5, color: 'var(--ink-faint)' }}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className="flex items-center gap-2 py-[3px] cursor-pointer select-none"
      title={hint}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className="num flex items-center justify-center shrink-0"
        style={{
          width: 13,
          height: 13,
          border: `1px solid ${checked ? 'var(--measured)' : 'var(--hairline-strong)'}`,
          background: checked ? 'color-mix(in srgb, var(--measured) 22%, transparent)' : 'transparent',
          color: 'var(--measured)',
          fontSize: 9,
          lineHeight: 1,
        }}
      >
        {checked ? '✓' : ''}
      </span>
      <span style={{ fontSize: 11.5, color: checked ? 'var(--ink)' : 'var(--ink-dim)' }}>
        {label}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      role="tablist"
      className="grid gap-px"
      style={{
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
        border: '1px solid var(--hairline)',
        background: 'var(--hairline)',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className="num"
            style={{
              background: selected ? 'rgba(125,211,252,0.15)' : 'rgba(10,14,21,0.9)',
              color: selected ? 'var(--focus)' : 'var(--ink-dim)',
              padding: '5px 4px',
              fontSize: 9.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal magnitude bar. Carries a printed value so it is never colour-only. */
export function Meter({
  value,
  max,
  label,
  valueLabel,
  color = 'var(--measured)',
  onClick,
  active,
}: {
  value: number;
  max: number;
  label: string;
  valueLabel: string;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const fraction = max > 0 ? Math.min(1, value / max) : 0;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className="block w-full text-left"
      style={{ cursor: onClick ? 'pointer' : 'default', background: 'transparent', border: 'none', padding: 0 }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate"
          style={{ fontSize: 10.5, color: active ? 'var(--focus)' : 'var(--ink-dim)' }}
        >
          {label}
        </span>
        <span className="num shrink-0" style={{ fontSize: 10, color: 'var(--ink)' }}>
          {valueLabel}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: 'rgba(148,176,214,0.1)',
          marginTop: 2,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            background: color,
            transition: 'width 220ms ease',
          }}
        />
      </div>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

export const fmtInt = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : '--';

export const fmt = (n: number, digits = 1): string =>
  Number.isFinite(n) ? n.toFixed(digits) : '--';

/** Compact form for counts that can reach millions in a narrow column. */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

/** FlyWire IDs are 18 digits; group them so they can be read and compared. */
export function fmtFlywire(id: string): string {
  return id.length > 12 ? `${id.slice(0, 9)} ${id.slice(9)}` : id;
}
