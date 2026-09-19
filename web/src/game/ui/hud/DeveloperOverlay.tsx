/**
 * The developer overlay.
 *
 * Everything that used to be permanently on screen -- phase, search depth,
 * node counts, timings, raw fly and neural state -- lives here, behind
 * Settings → Developer Mode, and is off by default.
 *
 * It is still worth having. "The AI is thinking" is an easy claim; a live
 * node count and a FEN are how you tell a working engine from a convincing
 * animation. It is just not something to show someone who wants to play
 * chess.
 */

import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../store';
import { TONE, label, mono, panel } from './chrome';

export function DeveloperOverlay() {
  const on = useGame((s) => s.settings.debugOverlay);
  const fen = useGame((s) => s.fen);
  const phase = useGame((s) => s.phase);
  const turn = useGame((s) => s.turn);
  const camera = useGame((s) => s.camera);
  const selectedSquare = useGame((s) => s.selectedSquare);
  const legalMoves = useGame((s) => s.legalMovesForSelected);
  const allLegal = useGame((s) => s.allLegalMoves);
  const aiThinking = useGame((s) => s.aiThinking);
  const aiMetrics = useGame((s) => s.aiMetrics);
  const carry = useGame((s) => s.carry);
  const carrySample = useGame((s) => s.carrySample);
  const neuralState = useGame((s) => s.neuralState);
  const fps = useFps(on);

  if (!on) return null;

  const rows: [string, string][] = [
    ['fps', String(fps)],
    ['phase', phase],
    ['turn', turn === 'w' ? 'white' : 'black'],
    ['camera', camera],
    ['legal', `${allLegal.length} total`],
    ['selected', selectedSquare ?? '--'],
    ['for piece', selectedSquare ? `${legalMoves.length} moves` : '--'],
    ['ai', aiThinking ? 'searching' : 'idle'],
    ['depth', aiMetrics ? String(aiMetrics.depth) : '--'],
    ['nodes', aiMetrics ? aiMetrics.nodes.toLocaleString() : '--'],
    ['time', aiMetrics ? `${aiMetrics.timeMs} ms` : '--'],
    ['carry', carry ? `${carry.from}->${carry.to}` : '--'],
    ['fly', carrySample?.stage ?? '--'],
    ['holding', carrySample?.carrying ? 'yes' : 'no'],
    ['motor', neuralState.motor.toFixed(2)],
    ['attention', neuralState.attention.toFixed(2)],
  ];

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: 12, top: 76, width: 214, zIndex: 40 }}
    >
      <div style={{ ...panel(), padding: '9px 10px' }}>
        <div style={{ ...label, color: TONE.accent, marginBottom: 6 }}>Developer</div>
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between"
            style={{ ...mono, fontSize: 9.5, lineHeight: 1.55 }}
          >
            <span style={{ color: TONE.faint }}>{k}</span>
            <span style={{ color: TONE.dim, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
        <div
          style={{
            ...mono,
            fontSize: 8,
            color: TONE.faint,
            marginTop: 6,
            wordBreak: 'break-all',
            lineHeight: 1.4,
          }}
        >
          {fen}
        </div>
      </div>
    </div>
  );
}

/**
 * Frames per second, sampled once a second.
 *
 * Counting frames costs nothing; re-rendering the HUD on every one of them
 * would cost a great deal, so the count is kept in a ref and only published
 * to React when the number actually changes.
 */
function useFps(active: boolean): number {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      frames.current += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - last)));
        frames.current = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return fps;
}
