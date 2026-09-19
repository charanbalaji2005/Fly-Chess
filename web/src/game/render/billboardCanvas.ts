/**
 * Canvas renderer for the aerial stadium sky display.
 *
 * Renders at 2048 x 768 to an HTML5 2D canvas, which is uploaded as an emissive
 * CanvasTexture onto the 3D aerial jumbotron suspended in the stadium sky.
 *
 * Prominently presents:
 *   - The Last Move played (Piece Glyph + SAN + From/To Squares + Capture tags)
 *   - The Next Move / Who's turn (Glowing card + action instructions)
 *   - AI Hardness level badge with Elo rating
 *   - Live countdown clocks and captured pieces
 *   - Move history ribbon
 */

import type { BillboardData } from './billboardData';

export const SCREEN_W = 2048;
export const SCREEN_H = 768;

const INK = '#f8fafc';
const DIM = '#94a3b8';
const FAINT = '#475569';
const ACCENT = '#38bdf8';
const ACCENT_GLOW = 'rgba(56, 189, 248, 0.25)';
const AMBER = '#fbbf24';
const DANGER = '#f43f5e';
const GOOD = '#34d399';
const PURPLE = '#c084fc';
const PANEL_BG = 'rgba(15, 23, 42, 0.85)';
const CARD_BG = 'rgba(11, 19, 35, 0.92)';

const PIECE_GLYPH: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

const sans = (size: number, weight = 600) =>
  `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
const mono = (size: number, weight = 700) =>
  `${weight} ${size}px "SF Mono", ui-monospace, Menlo, monospace`;

export function paintBillboard(
  ctx: CanvasRenderingContext2D,
  data: BillboardData,
  reveal = 1,
): void {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

  // 1. Deep stadium dark gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  bg.addColorStop(0, '#0a101d');
  bg.addColorStop(0.5, '#050a14');
  bg.addColorStop(1, '#03060c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // 2. Faint neural network lattice across background
  drawNeuralGrid(ctx);

  // 3. Top Header Bar (Masthead + AI Hardness Badge)
  drawHeader(ctx, data);

  // 4. Left Column: White Player Card & Clock
  drawPlayerCard(ctx, data.white, 50, 140, 440, 450);

  // 5. Right Column: Black Player Card & Clock
  drawPlayerCard(ctx, data.black, SCREEN_W - 490, 140, 440, 450);

  // 6. Central Arena Display: LAST MOVE & NEXT TO MOVE (The focal point!)
  drawCenterStage(ctx, data, reveal);

  // 7. Bottom Ribbon: Recent Moves History
  drawMoveHistoryRibbon(ctx, data);

  // 8. Subtle CRT/LED subpixel scanline overlay for stadium texture
  drawScanlines(ctx);
}

function drawHeader(ctx: CanvasRenderingContext2D, data: BillboardData) {
  // Brand title
  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.font = sans(30, 900);
  ctx.letterSpacing = '6px';
  ctx.fillText('DROSOPHILA NEURAL CHESS', 50, 62);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = DIM;
  ctx.font = sans(15, 600);
  ctx.letterSpacing = '3px';
  ctx.fillText('3D AERIAL ARENA BROADCAST', 52, 92);
  ctx.letterSpacing = '0px';

  // AI Hardness Level Badge (Prominently featured in top right)
  const badgeW = 460;
  const badgeH = 56;
  const badgeX = SCREEN_W - badgeW - 50;
  const badgeY = 38;

  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  ctx.fill();
  ctx.stroke();

  // Difficulty glow dot
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(badgeX + 26, badgeY + 28, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = sans(17, 800);
  ctx.letterSpacing = '1px';
  ctx.fillText(`AI DIFFICULTY: ${data.aiLevelName}`, badgeX + 44, badgeY + 28);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = ACCENT;
  ctx.font = mono(13, 700);
  ctx.fillText(`${data.aiElo} · REAL-TIME α-β SEARCH`, badgeX + 44, badgeY + 46);

  // Header separator rule
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(50, 115);
  ctx.lineTo(SCREEN_W - 50, 115);
  ctx.stroke();
}

function drawPlayerCard(
  ctx: CanvasRenderingContext2D,
  player: BillboardData['white'],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Container Box
  ctx.fillStyle = player.active ? 'rgba(56, 189, 248, 0.08)' : CARD_BG;
  ctx.strokeStyle = player.active ? 'rgba(56, 189, 248, 0.65)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = player.active ? 3 : 1.5;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();

  // Active halo
  if (player.active) {
    ctx.strokeStyle = ACCENT_GLOW;
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  const cx = x + w / 2;

  // Header Tag
  ctx.textAlign = 'center';
  ctx.fillStyle = player.color === 'WHITE' ? '#ffffff' : '#cbd5e1';
  ctx.font = sans(34, 900);
  ctx.letterSpacing = '4px';
  ctx.fillText(player.color, cx, y + 54);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = player.active ? ACCENT : DIM;
  ctx.font = sans(17, 700);
  ctx.letterSpacing = '1.5px';
  ctx.fillText(player.role, cx, y + 84);
  ctx.letterSpacing = '0px';

  // Digital Chess Clock
  const clockY = y + 185;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x + 30, clockY - 60, w - 60, 80, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = player.active ? '#ffffff' : FAINT;
  ctx.font = mono(54, 800);
  ctx.fillText(player.clock, cx, clockY);

  // Status indicator
  if (player.active) {
    ctx.fillStyle = GOOD;
    ctx.font = sans(15, 800);
    ctx.letterSpacing = '2px';
    ctx.fillText('● ACTIVE ON MOVE', cx, y + 245);
    ctx.letterSpacing = '0px';
  } else {
    ctx.fillStyle = FAINT;
    ctx.font = sans(15, 600);
    ctx.fillText('AWAITING OPPONENT', cx, y + 245);
  }

  // Captured pieces tray
  const trayY = y + 305;
  ctx.fillStyle = FAINT;
  ctx.font = sans(13, 700);
  ctx.letterSpacing = '3px';
  ctx.fillText('CAPTURED PIECES', cx, trayY);
  ctx.letterSpacing = '0px';

  if (player.captured.length > 0) {
    ctx.fillStyle = player.color === 'WHITE' ? '#f1f5f9' : '#94a3b8';
    ctx.font = sans(26);
    const glyphs = player.captured.map((p) => PIECE_GLYPH[p] ?? p).join(' ');
    ctx.fillText(glyphs, cx, trayY + 38);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.font = sans(15, 500);
    ctx.fillText('None yet', cx, trayY + 36);
  }

  // Winner banner
  if (player.winner) {
    ctx.fillStyle = GOOD;
    ctx.font = sans(28, 900);
    ctx.letterSpacing = '6px';
    ctx.fillText('★ VICTORY ★', cx, y + 410);
    ctx.letterSpacing = '0px';
  }
}

function drawCenterStage(
  ctx: CanvasRenderingContext2D,
  data: BillboardData,
  reveal: number,
) {
  const cx = SCREEN_W / 2;
  const stageW = 960;
  const stageX = cx - stageW / 2;

  // -------------------------------------------------------------
  // CARD 1: LAST MOVE PLAYED (Top half of center stage)
  // -------------------------------------------------------------
  const lastY = 140;
  const lastH = 220;

  ctx.fillStyle = PANEL_BG;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, stageX, lastY, stageW, lastH, 16);
  ctx.fill();
  ctx.stroke();

  // Top header of Last Move Card
  ctx.textAlign = 'center';
  ctx.fillStyle = FAINT;
  ctx.font = sans(15, 800);
  ctx.letterSpacing = '5px';
  ctx.fillText(
    data.lastMoveBy ? `LAST MOVE PLAYED BY ${data.lastMoveBy}` : 'LAST MOVE',
    cx,
    lastY + 34,
  );
  ctx.letterSpacing = '0px';

  if (data.lastMoveSan) {
    ctx.save();
    const eased = reveal * reveal * (3 - 2 * reveal);
    ctx.globalAlpha = 0.4 + eased * 0.6;

    // Big piece glyph + SAN: e.g. "♞ Nf3"
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = mono(76, 900);
    const moveText = data.lastMovePiece ? `${data.lastMovePiece} ${data.lastMoveSan}` : data.lastMoveSan;
    ctx.fillText(moveText, cx, lastY + 120);

    // Origin ➔ Destination squares badge: e.g. "[ e2 ] ➔ [ e4 ]"
    if (data.lastMoveSquares) {
      ctx.fillStyle = ACCENT;
      ctx.font = mono(26, 700);
      ctx.fillText(data.lastMoveSquares, cx, lastY + 164);
    }

    // Capture or Event badge
    if (data.banner) {
      const bannerColor =
        data.bannerTone === 'GOOD' ? GOOD : data.bannerTone === 'DANGER' ? DANGER : AMBER;
      ctx.fillStyle = bannerColor;
      ctx.font = sans(15, 900);
      ctx.letterSpacing = '4px';
      ctx.fillText(`★ ${data.banner} ★`, cx, lastY + 196);
      ctx.letterSpacing = '0px';
    }

    ctx.restore();
  } else {
    ctx.fillStyle = DIM;
    ctx.font = sans(24, 600);
    ctx.letterSpacing = '3px';
    ctx.fillText('AWAITING FIRST MOVE', cx, lastY + 124);
    ctx.letterSpacing = '0px';
  }

  // -------------------------------------------------------------
  // CARD 2: NEXT TO MOVE & ACTION PROMPT (Bottom half of center stage)
  // -------------------------------------------------------------
  const nextY = 380;
  const nextH = 210;

  const isCheck = data.isCheck;
  const isOver = data.isGameOver;

  const borderColor = isOver
    ? GOOD
    : isCheck
      ? DANGER
      : data.nextColor === 'WHITE'
        ? ACCENT
        : PURPLE;

  const glowBg = isOver
    ? 'rgba(52, 211, 153, 0.12)'
    : isCheck
      ? 'rgba(244, 63, 94, 0.14)'
      : 'rgba(56, 189, 248, 0.1)';

  ctx.fillStyle = glowBg;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  roundRect(ctx, stageX, nextY, stageW, nextH, 16);
  ctx.fill();
  ctx.stroke();

  // Glow line
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 8;
  ctx.stroke();

  // Title: "▶ NEXT TO MOVE: WHITE (YOU)"
  ctx.textAlign = 'center';
  ctx.fillStyle = borderColor;
  ctx.font = sans(34, 900);
  ctx.letterSpacing = '4px';

  let nextHeadline = `▶ NEXT TO MOVE: ${data.nextColor} (${data.nextRole})`;
  if (isOver) {
    nextHeadline = `★ MATCH FINISHED ★`;
  } else if (isCheck) {
    nextHeadline = `⚠️ ${data.nextColor} KING IS IN CHECK!`;
  }
  ctx.fillText(nextHeadline, cx, nextY + 65);
  ctx.letterSpacing = '0px';

  // Action instruction prompt
  ctx.fillStyle = INK;
  ctx.font = sans(21, 600);
  ctx.fillText(data.nextPrompt, cx, nextY + 115);

  // Search details (if AI is searching)
  if (data.thinking) {
    ctx.fillStyle = AMBER;
    ctx.font = mono(18, 700);
    ctx.letterSpacing = '2px';
    ctx.fillText('NEURAL ENGINE ITERATIVE SEARCH IN PROGRESS...', cx, nextY + 160);
    ctx.letterSpacing = '0px';
  } else if (data.search) {
    ctx.fillStyle = DIM;
    ctx.font = mono(16, 600);
    ctx.fillText(
      `Search: Depth ${data.search.depth} · ${data.search.nodes.toLocaleString()} Nodes · ${(data.search.timeMs / 1000).toFixed(2)}s`,
      cx,
      nextY + 160,
    );
  } else {
    ctx.fillStyle = FAINT;
    ctx.font = sans(15, 600);
    ctx.fillText('FIDE Tournament Standard Rules · Physical Fly Carry', cx, nextY + 160);
  }
}

function drawMoveHistoryRibbon(ctx: CanvasRenderingContext2D, data: BillboardData) {
  const ribbonY = SCREEN_H - 110;
  const ribbonH = 75;
  const ribbonX = 50;
  const ribbonW = SCREEN_W - 100;

  ctx.fillStyle = 'rgba(8, 14, 26, 0.95)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  roundRect(ctx, ribbonX, ribbonY, ribbonW, ribbonH, 12);
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.font = sans(14, 800);
  ctx.letterSpacing = '3px';
  ctx.fillText('MOVE HISTORY', ribbonX + 24, ribbonY + 44);
  ctx.letterSpacing = '0px';

  // Moves list
  const startX = ribbonX + 200;
  if (data.moves.length === 0) {
    ctx.fillStyle = FAINT;
    ctx.font = sans(16, 500);
    ctx.fillText('No moves played yet. Game ready.', startX, ribbonY + 44);
    return;
  }

  ctx.font = mono(20, 600);
  let curX = startX;

  data.moves.forEach((move, i) => {
    const isNewest = i === data.moves.length - 1;

    ctx.fillStyle = isNewest ? AMBER : DIM;
    ctx.fillText(`${move.n}.`, curX, ribbonY + 44);
    curX += 34;

    ctx.fillStyle = isNewest && !move.black ? INK : '#e2e8f0';
    ctx.fillText(move.white ?? '', curX, ribbonY + 44);
    curX += 88;

    if (move.black) {
      ctx.fillStyle = isNewest ? INK : '#cbd5e1';
      ctx.fillText(move.black, curX, ribbonY + 44);
      curX += 88;
    }

    curX += 24;
  });
}

function drawNeuralGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineWidth = 1;

  let seed = 428912;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const nodes: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    nodes.push([rand() * SCREEN_W, 120 + rand() * (SCREEN_H - 240)]);
  }

  for (const [x, y] of nodes) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i][0] - nodes[j][0];
      const dy = nodes[i][1] - nodes[j][1];
      if (dx * dx + dy * dy < 160 * 160) {
        ctx.beginPath();
        ctx.moveTo(nodes[i][0], nodes[i][1]);
        ctx.lineTo(nodes[j][0], nodes[j][1]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < SCREEN_H; y += 4) {
    ctx.fillRect(0, y, SCREEN_W, 1.5);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
