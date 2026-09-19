/**
 * The in-game interface.
 *
 * One screen-space layer over the canvas. The rules it is built to:
 *
 *   1. The board is the subject. Nothing permanent sits over the middle of
 *      the screen -- panels are pinned to the edges and the centre is left
 *      alone at every size.
 *   2. **The board answers the questions, not the HUD.** What move was just
 *      played, whether it took something, whether the king is in check --
 *      all of that is drawn on the squares it concerns, in
 *      `BoardAnnotations`. The HUD only announces; the board records.
 *   3. One source of truth per fact. Whose move it is is stated once.
 *   4. Anything not needed while choosing a move is behind a button.
 *
 * A phone gets a different arrangement rather than a scaled-down desktop
 * one: there is no room beside a board on a 390px screen, so the panels go
 * above and below it and the optional ones become bottom sheets.
 *
 * Keyboard shortcuts live in `driver.ts` with the rest of the input, not
 * here: two listeners for the same keys meant `U` undid two moves.
 *
 * **This layer is plain DOM and is never parented to the Three.js camera.**
 * That is what guarantees it cannot mirror. The reversed lettering that
 * once appeared when the camera orbited came from an in-world canvas panel
 * read from behind; there is no such panel in the scene any more, and the
 * move result lives here in the DOM where it cannot flip.
 */

import { useEffect } from 'react';

import { useGame } from '../store';
import { BottomBar } from './hud/BottomBar';
import { DeveloperOverlay } from './hud/DeveloperOverlay';
import {
  MobileBottomBar,
  MobileSheet,
  MobileSideClocks,
  MobileTopBar,
} from './hud/MobileHud';
import { MoveList } from './hud/MoveList';
import { MoveResult } from './hud/MoveResult';
import { NeuralDrawer, NeuralReadout } from './hud/NeuralDrawer';
import { BrainSidePanel } from './hud/BrainSidePanel';
import { Notice, GameOverOverlay } from './hud/Notices';
import { PlayerCards } from './hud/PlayerCards';
import { SettingsDrawer } from './hud/SettingsDrawer';
import { TopBar } from './hud/TopBar';
import { useViewport } from './hud/useViewport';
import { SettingsControls } from './SettingsPanel';

export function GameHud() {
  const viewport = useViewport();
  const setScreen = useGame((s) => s.setScreen);
  useTurnNotices();

  const mobile = viewport.kind === 'MOBILE';

  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ zIndex: 10 }}>
      {mobile ? (
        <MobileLayout
          portrait={viewport.portrait}
          onExit={() => setScreen('MENU')}
        />
      ) : (
        <>
          <TopBar onExit={() => setScreen('MENU')} />
          <PlayerCards />
          {/* a tablet has room for the move list beside the board; a phone
              does not, so there it is a sheet reached from the action bar */}
          <MoveList />
          <BottomBar />
          <NeuralDrawer />
          <SettingsDrawer />
          {/* 3D Google FlyWire Connectome Visualizer side panel */}
          <BrainSidePanel />
        </>
      )}

      <MoveResult kind={viewport.kind} />
      <Notice />
      <DeveloperOverlay />
      <GameOverOverlay />
    </div>
  );
}

/**
 * Phone: status on top, board in the middle, one strip at the foot.
 *
 * The three optional panels share the sheet, one at a time, which keeps the
 * board clear whenever nothing is open.
 */
function MobileLayout({
  portrait,
  onExit,
}: {
  portrait: boolean;
  onExit: () => void;
}) {
  const uiPanel = useGame((s) => s.uiPanel);
  const setUiPanel = useGame((s) => s.setUiPanel);
  const moveHistory = useGame((s) => s.moveHistory);

  const close = () => setUiPanel('NONE');

  return (
    <>
      <MobileTopBar onExit={onExit} />
      {!portrait && <MobileSideClocks />}
      <MobileBottomBar portrait={portrait} />

      <MobileSheet open={uiPanel === 'HISTORY'} title="Moves" onClose={close}>
        <MobileMoveList sans={moveHistory.map((m) => m.san)} />
      </MobileSheet>

      <MobileSheet open={uiPanel === 'NEURAL'} title="Neural state" onClose={close}>
        <NeuralReadout />
      </MobileSheet>

      <MobileSheet open={uiPanel === 'SETTINGS'} title="Settings" onClose={close}>
        <SettingsControls />
      </MobileSheet>
    </>
  );
}

function MobileMoveList({ sans }: { sans: string[] }) {
  if (sans.length === 0) {
    return <div style={{ fontSize: 12, color: '#65788e' }}>No moves yet.</div>;
  }

  const pairs: { n: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push({ n: i / 2 + 1, white: sans[i], black: sans[i + 1] });
  }

  return (
    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
      {pairs.map((pair) => (
        <div
          key={pair.n}
          className="flex items-baseline"
          style={{ gap: 10, padding: '4px 0', color: '#e7eef7' }}
        >
          <span style={{ color: '#65788e', width: 26, flex: 'none' }}>{pair.n}.</span>
          <span style={{ flex: 1 }}>{pair.white ?? ''}</span>
          <span style={{ flex: 1 }}>{pair.black ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Announce the things worth announcing, and only those.
 *
 * Driven by real transitions rather than by a timer: check appears when the
 * position becomes check, and only while the engine reports it.
 */
function useTurnNotices(): void {
  const inCheck = useGame((s) => s.status.inCheck);
  const isOver = useGame((s) => s.status.isOver);
  const moveCount = useGame((s) => s.moveHistory.length);
  const notify = useGame((s) => s.notify);

  useEffect(() => {
    if (inCheck && !isOver) notify('Check', 'BAD');
  }, [inCheck, isOver, moveCount, notify]);
}
