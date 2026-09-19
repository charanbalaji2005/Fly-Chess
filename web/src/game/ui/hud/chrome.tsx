/**
 * The shared vocabulary of the HUD.
 *
 * One panel style, one radius, one type scale, one set of tones. The old
 * interface mixed four corner radii, three border weights and a dozen ad-hoc
 * colours, which is most of why it read as a dashboard: inconsistency looks
 * like debug output even when every individual panel is fine.
 *
 * Everything here is screen-space DOM. None of it is inside the Three.js
 * canvas, none of it is parented to a camera, and none of it carries a
 * transform that could flip it -- so no view, orbit or board rotation can
 * mirror the interface.
 */

import type { CSSProperties, ReactNode } from 'react';

/** One radius for every surface. */
export const RADIUS = 12;

export const TONE = {
  ink: '#e7eef7',
  dim: '#9fb0c4',
  faint: '#65788e',
  accent: '#5ecbf5',
  good: '#4ade80',
  warn: '#f0b429',
  bad: '#f43f5e',
} as const;

/**
 * The one panel surface.
 *
 * Restrained glass: enough blur to separate the panel from the stadium
 * behind it, not so much that it becomes a frosted slab sitting on the
 * board. The border is nearly invisible by design -- separation comes from
 * the backdrop and the shadow, not from an outline.
 */
export const panel = (extra: CSSProperties = {}): CSSProperties => ({
  background: 'rgba(10, 15, 25, 0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: RADIUS,
  boxShadow: '0 8px 28px rgba(0,0,0,0.38)',
  ...extra,
});

export const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: TONE.faint,
  fontWeight: 700,
};

export const mono: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

/** A status dot. The only place a bare colour is allowed to carry meaning. */
export function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: pulse ? 'hudPulse 1.6s ease-in-out infinite' : undefined,
        flex: 'none',
      }}
    />
  );
}

/**
 * An icon-sized action.
 *
 * Square, quiet, and always labelled for screen readers -- the top bar is
 * three of these rather than a row of captioned buttons, which is where
 * most of the old bar's width went.
 */
export function IconButton({
  onClick,
  title,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        display: 'grid',
        placeItems: 'center',
        borderRadius: RADIUS - 2,
        border: `1px solid ${active ? 'rgba(94,203,245,0.5)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(94,203,245,0.14)' : 'rgba(255,255,255,0.04)',
        color: active ? TONE.accent : TONE.dim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
      }}
    >
      {children}
    </button>
  );
}

/** A text action, for the bottom bar. */
export function TextButton({
  onClick,
  children,
  disabled = false,
  tone = 'default',
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  title?: string;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        padding: '7px 14px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderRadius: RADIUS - 2,
        border: `1px solid ${danger ? 'rgba(244,63,94,0.32)' : 'rgba(255,255,255,0.08)'}`,
        background: danger ? 'rgba(244,63,94,0.12)' : 'rgba(255,255,255,0.05)',
        color: disabled ? TONE.faint : danger ? '#fca5b5' : TONE.ink,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 160ms ease, opacity 160ms ease',
      }}
    >
      {children}
    </button>
  );
}

/** A labelled meter, used by the neural drawer. */
export function Meter({
  name,
  value,
  color = TONE.accent,
}: {
  name: string;
  value: number;
  color?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div style={{ marginBottom: 7 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
        <span style={{ ...label, fontSize: 9 }}>{name}</span>
        <span style={{ ...mono, fontSize: 9, color: TONE.faint }}>{pct}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            background: color,
            transition: 'width 140ms linear',
          }}
        />
      </div>
    </div>
  );
}

/**
 * A right-hand drawer.
 *
 * Slides rather than appears, and is mounted only while open, so nothing it
 * contains costs anything during normal play.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  width = 252,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <aside
      aria-hidden={!open}
      aria-label={title}
      className="pointer-events-auto"
      style={{
        ...panel(),
        position: 'absolute',
        top: 62,
        right: 12,
        width,
        maxHeight: 'calc(100vh - 150px)',
        overflowY: 'auto',
        padding: '12px 13px 14px',
        transform: open ? 'translateX(0)' : `translateX(${width + 24}px)`,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={label}>{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          style={{
            border: 'none',
            background: 'none',
            color: TONE.faint,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}
