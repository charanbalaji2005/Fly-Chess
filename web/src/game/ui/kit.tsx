/**
 * Game-side UI pieces.
 *
 * The laboratory's primitives are deliberately tiny -- they are chrome around
 * a dataset. A game needs targets you can hit without looking, so these are
 * larger and louder while still using the same tokens from index.css, which is
 * what keeps the two halves of the app feeling like one product.
 */

import type { CSSProperties, ReactNode } from 'react';

import { COLOR_HEX, SEAT_COLORS } from '../rules';
import type { PlayerColor, SeatId } from '../types';

// ---------------------------------------------------------------------------
// buttons
// ---------------------------------------------------------------------------

export function GameButton({
  children,
  onClick,
  variant = 'default',
  disabled,
  size = 'md',
  full,
  accent,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  /** Overrides the variant colour, for player-coloured actions. */
  accent?: string;
  title?: string;
}) {
  const pad =
    size === 'lg' ? '14px 26px' : size === 'sm' ? '6px 11px' : '10px 18px';
  const font = size === 'lg' ? 14 : size === 'sm' ? 10 : 11.5;

  const palette: Record<string, { bg: string; border: string; fg: string }> = {
    default: {
      bg: 'rgba(148,176,214,0.08)',
      border: 'var(--hairline-strong)',
      fg: 'var(--ink)',
    },
    primary: {
      bg: 'rgba(53,208,192,0.16)',
      border: 'rgba(53,208,192,0.55)',
      fg: '#7ff0e2',
    },
    ghost: { bg: 'transparent', border: 'var(--hairline)', fg: 'var(--ink-dim)' },
    danger: {
      bg: 'rgba(242,99,126,0.14)',
      border: 'rgba(242,99,126,0.5)',
      fg: '#ff9aae',
    },
  };

  const p = palette[variant];
  const style: CSSProperties = {
    background: accent ? `color-mix(in srgb, ${accent} 20%, transparent)` : p.bg,
    border: `1px solid ${accent ?? p.border}`,
    color: accent ?? p.fg,
    padding: pad,
    fontSize: font,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
    width: full ? '100%' : undefined,
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 140ms, border-color 140ms, transform 90ms',
  };

  return (
    <button
      type="button"
      className="num"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'translateY(1px)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = '';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// player identity
// ---------------------------------------------------------------------------

/**
 * Colour swatch plus the colour's name.
 *
 * Always paired, never a bare dot: a player must be identifiable without
 * relying on telling red from green.
 */
export function ColorTag({ seat, label }: { seat: SeatId; label?: string }) {
  const color: PlayerColor = SEAT_COLORS[seat];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: COLOR_HEX[color],
          boxShadow: `0 0 8px ${COLOR_HEX[color]}88`,
        }}
      />
      <span className="num" style={{ fontSize: 10, letterSpacing: '0.08em' }}>
        {label ?? color}
      </span>
    </span>
  );
}

/**
 * Token counter: one pip per piece, filled as they reach the core.
 *
 * Shape carries the information, so it survives being read in greyscale.
 */
export function TokenPips({
  total,
  finished,
  active,
  color,
}: {
  total: number;
  finished: number;
  active: number;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1" title={`${finished} of ${total} home`}>
      {Array.from({ length: total }, (_, i) => {
        const done = i < finished;
        const out = i < finished + active;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: done ? 2 : 99,
              background: done ? color : out ? `${color}66` : 'transparent',
              border: `1px solid ${done || out ? color : 'var(--hairline-strong)'}`,
            }}
          />
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

/** Frosted card used by every overlay panel. */
export function Card({
  children,
  style,
  className = '',
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`panel ${className}`}
      style={{ padding: 18, ...style }}
    >
      {children}
    </div>
  );
}

/** Full-screen backdrop for menus and modals. */
export function Overlay({
  children,
  onClose,
  dim = 0.72,
}: {
  children: ReactNode;
  onClose?: () => void;
  dim?: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: `rgba(3,5,9,${dim})`, backdropFilter: 'blur(3px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div onClick={(e) => e.stopPropagation()} className="max-h-full overflow-auto">
        {children}
      </div>
    </div>
  );
}

/** Section heading inside a card. */
export function Heading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="label" style={{ color: 'var(--ink-dim)' }}>
        {children}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}

/** The product wordmark. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <div className="select-none">
      <div
        className="num"
        style={{
          fontSize: big ? 13 : 9.5,
          letterSpacing: '0.42em',
          color: 'var(--measured)',
          textTransform: 'uppercase',
        }}
      >
        Drosophila
      </div>
      <div
        style={{
          fontSize: big ? 46 : size === 'sm' ? 15 : 22,
          fontWeight: 700,
          letterSpacing: big ? '0.06em' : '0.03em',
          lineHeight: 1.05,
          color: 'var(--ink)',
        }}
      >
        Neural Ludo
      </div>
    </div>
  );
}
