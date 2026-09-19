/**
 * Drosophila Neural Chess - Master Game Store (Zustand).
 *
 * Single source of truth for:
 * - Chess Engine state (chess.js)
 * - 6-tier AI decision layer
 * - Physical Drosophila carry plan
 * - Neural sensory & activity state
 * - Clocks, timers, captured pieces, and camera presets
 */

import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import {
  createChess,
  extractPieces,
  getLegalMoves,
  makeMove,
  getStatus,
  INITIAL_FEN,
  type ChessPieceState,
  type LegalMove,
  type ChessStatus,
  type PieceType,
} from './chessEngine';
import { computeAiMove, type AiLevel, type AiSearchResult } from './chessAi';
import {
  createCarryPlan,
  sampleCarry,
  type CarryPlan,
  type CarrySample,
} from './carry';
import { NeuralStateMachine, type NeuralEvent, type NeuralState } from './neural/state';
import { computeNeuralDecision } from './neural/controller';
import type { NeuralDecision } from './neural/types';
import type {
  SeatId,
  PlayerColor,
  Controller,
  GameMode,
  TimePreset,
  GamePhase,
  GameSettings,
  PlayerState,
} from './types';
import { TIME_PRESETS } from './rules';

export type Screen = 'MENU' | 'SETUP' | 'GAME' | 'RESULT';

export type CameraPreset =
  | 'BOARD'
  | 'WHITE'
  | 'BLACK'
  | 'PIECE'
  | 'NEURAL'
  | 'SPECTATOR'
  | 'BILLBOARD'
  | 'FREE';

export interface CorePulse {
  key: string;
  startedAt: number;
  strength: number;
}

export interface MatchConfig {
  mode: GameMode;
  playerColor: PlayerColor | 'RANDOM';
  aiLevel: AiLevel;
  environment: 'SUN' | 'NIGHT';
  timePreset: TimePreset;
}

export const DEFAULT_SETTINGS: GameSettings = {
  environment: 'SUN',
  quality: 'HIGH',
  soundVolume: 0.8,
  neuralVisuals: true,
  reducedMotion: false,
  cameraFollow: true,
  cameraSensitivity: 1.0,
  debugOverlay: false,
};

export const DEFAULT_CONFIG: MatchConfig = {
  mode: 'HUMAN_VS_AI',
  playerColor: 'WHITE',
  aiLevel: 'HARD',
  environment: 'SUN',
  timePreset: '5+0',
};

/**
 * Which overlay is open.
 *
 * Interface state, kept apart from game state on purpose: opening a drawer
 * is not a game event, must never be able to affect a position, and should
 * not survive a new match the way a setting does.
 */
export type UiPanel = 'NONE' | 'NEURAL' | 'SETTINGS' | 'HISTORY' | 'VIEW';

export interface Notification {
  id: number;
  text: string;
  tone: 'INFO' | 'GOOD' | 'WARN' | 'BAD';
}

export interface GameStore {
  // Screen & UI
  screen: Screen;
  camera: CameraPreset;
  paused: boolean;
  /** The single open overlay, if any. Only one at a time, by construction. */
  uiPanel: UiPanel;
  /** Transient banner near the top of the screen. */
  notification: Notification | null;
  settings: GameSettings;
  config: MatchConfig;

  // Chess Engine & Match
  chess: Chess;
  fen: string;
  pieces: ChessPieceState[];
  currentSeat: SeatId;
  turn: 'w' | 'b';
  phase: GamePhase;
  status: ChessStatus;
  selectedSquare: Square | null;
  legalMovesForSelected: LegalMove[];
  allLegalMoves: LegalMove[];
  moveHistory: LegalMove[];
  /**
   * When the last move was committed, on the performance clock.
   *
   * The board annotations and the result toast both time themselves from
   * this. It is set in `completeCarry`, which runs when the fly puts the
   * piece down -- so nothing announces a move before the piece has landed.
   */
  lastMoveAt: number;
  pendingPromotion: { from: Square; to: Square } | null;

  // Clocks
  clocks: { 0: number; 1: number };
  lastClockTick: number;

  // Players
  players: [PlayerState, PlayerState];
  winner: SeatId | null;

  // Physical Carry
  carry: CarryPlan | null;
  carrySample: CarrySample | null;

  // AI
  aiThinking: boolean;
  aiMetrics: { depth: number; nodes: number; timeMs: number; score: number } | null;

  // Neural System
  neuralMachine: NeuralStateMachine;
  neuralState: NeuralState;
  decision: NeuralDecision | null;
  neuralActivity: number;
  crowd: { excitement: number };
  pulses: CorePulse[];
  pendingPromotionPiece: PieceType | null;

  // Actions
  addPulse: (strength?: number) => void;
  setScreen: (screen: Screen) => void;
  setCamera: (camera: CameraPreset) => void;
  setPaused: (paused: boolean) => void;
  setUiPanel: (panel: UiPanel) => void;
  /** Bring the camera back to the board view. */
  resetCamera: () => void;
  togglePanel: (panel: UiPanel) => void;
  notify: (text: string, tone?: Notification['tone']) => void;
  dismissNotification: (id: number) => void;
  resign: () => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  updateConfig: (config: Partial<MatchConfig>) => void;
  startMatch: (config?: Partial<MatchConfig>) => void;

  selectSquare: (square: Square | null) => void;
  requestMove: (from: Square, to: Square) => void;
  choosePromotion: (piece: PieceType) => void;
  executeMoveInternal: (from: Square, to: Square, promotion?: PieceType) => void;
  completeCarry: () => void;
  tickAi: () => Promise<void>;
  undoMove: () => void;
  tickClocks: (now: number) => void;
  sampleCarryFrame: (now: number) => void;
  emitNeuralEvent: (event: NeuralEvent) => void;
}

function createInitialPlayers(config: MatchConfig): [PlayerState, PlayerState] {
  let whiteController: Controller = 'HUMAN';
  let blackController: Controller = 'AI';

  if (config.mode === 'HUMAN_VS_HUMAN') {
    whiteController = 'HUMAN';
    blackController = 'HUMAN';
  } else if (config.mode === 'AI_VS_AI') {
    whiteController = 'AI';
    blackController = 'AI';
  } else {
    // HUMAN_VS_AI
    let chosenColor = config.playerColor;
    if (chosenColor === 'RANDOM') {
      chosenColor = Math.random() < 0.5 ? 'WHITE' : 'BLACK';
    }
    if (chosenColor === 'BLACK') {
      whiteController = 'AI';
      blackController = 'HUMAN';
    }
  }

  const initialMs = TIME_PRESETS[config.timePreset].initialMs;

  const white: PlayerState = {
    seat: 0,
    color: 'WHITE',
    name: whiteController === 'HUMAN' ? 'Human Player' : `Fly AI (${config.aiLevel})`,
    controller: whiteController,
    aiLevel: config.aiLevel,
    clockMs: initialMs,
    capturedPieces: [],
    stats: { moves: 0, captures: 0, checksGiven: 0, timeSpentMs: 0 },
  };

  const black: PlayerState = {
    seat: 1,
    color: 'BLACK',
    name: blackController === 'HUMAN' ? 'Human Player' : `Fly AI (${config.aiLevel})`,
    controller: blackController,
    aiLevel: config.aiLevel,
    clockMs: initialMs,
    capturedPieces: [],
    stats: { moves: 0, captures: 0, checksGiven: 0, timeSpentMs: 0 },
  };

  return [white, black];
}

/** Monotonic id, so a replaced banner can never dismiss its successor. */
let notificationId = 1;

const initialChess = createChess();
const initialPieces = extractPieces(initialChess);
const initialStatus = getStatus(initialChess);
const initialAllLegal = getLegalMoves(initialChess);
const initialNeuralMachine = new NeuralStateMachine();

export const useGame = create<GameStore>((set, get) => ({
  screen: 'MENU',
  camera: 'BOARD',
  paused: false,
  uiPanel: 'NONE',
  notification: null,
  settings: DEFAULT_SETTINGS,
  config: DEFAULT_CONFIG,

  chess: initialChess,
  fen: INITIAL_FEN,
  pieces: initialPieces,
  currentSeat: 0,
  turn: 'w',
  phase: 'READY',
  status: initialStatus,
  selectedSquare: null,
  legalMovesForSelected: [],
  allLegalMoves: initialAllLegal,
  moveHistory: [],
  lastMoveAt: 0,
  pendingPromotion: null,

  clocks: { 0: 300_000, 1: 300_000 },
  lastClockTick: Date.now(),

  players: createInitialPlayers(DEFAULT_CONFIG),
  winner: null,

  carry: null,
  carrySample: null,

  aiThinking: false,
  aiMetrics: null,

  neuralMachine: initialNeuralMachine,
  neuralState: initialNeuralMachine.state,
  decision: null,
  neuralActivity: 0.1,
  crowd: { excitement: 0.1 },
  pulses: [],
  pendingPromotionPiece: null,

  addPulse: (strength = 1) => {
    const now = performance.now();
    set((s) => ({
      pulses: [
        ...s.pulses.filter((p) => now - p.startedAt < 2200),
        { key: `pulse-${Date.now()}-${Math.random()}`, startedAt: now, strength },
      ],
    }));
  },

  setScreen: (screen) => set({ screen }),
  setCamera: (camera) => set({ camera }),
  setPaused: (paused) => set({ paused }),
  setUiPanel: (uiPanel) => set({ uiPanel }),

  /**
   * Back to the board.
   *
   * Called when a match starts and offered as a control, but deliberately
   * *not* fired after every move: a player who has chosen the Black-side or
   * stands view meant it, and yanking the camera back each turn would be
   * fighting them.
   */
  resetCamera: () => set({ camera: 'BOARD' }),

  // clicking the open panel's own button closes it, which is what every
  // drawer in every application does and what people expect
  togglePanel: (panel) => set((s) => ({ uiPanel: s.uiPanel === panel ? 'NONE' : panel })),

  notify: (text, tone = 'INFO') =>
    set({ notification: { id: notificationId++, text, tone } }),

  // Only clears the banner it was told about, so a message that arrived
  // after this one was scheduled for dismissal is not swallowed with it.
  dismissNotification: (id) =>
    set((s) => (s.notification?.id === id ? { notification: null } : s)),

  resign: () => {
    const s = get();
    if (s.status.isOver) return;
    const loser = s.currentSeat;
    const winner: SeatId = loser === 0 ? 1 : 0;
    // GAME_OVER as well as the status flag: the driver's AI loop and the
    // clock both key off the phase, and a resignation that only changed the
    // label would leave the computer happily playing on by itself.
    set({
      winner,
      phase: 'GAME_OVER',
      selectedSquare: null,
      legalMovesForSelected: [],
      status: {
        ...s.status,
        isOver: true,
        statusText: `${loser === 0 ? 'White' : 'Black'} resigned`,
      },
    });
    get().notify(`${loser === 0 ? 'White' : 'Black'} resigned`, 'BAD');
  },
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
  updateConfig: (partial) =>
    set((s) => ({ config: { ...s.config, ...partial } })),

  startMatch: (partialConfig) => {
    const config = { ...get().config, ...partialConfig };
    const chess = createChess();
    const pieces = extractPieces(chess);
    const status = getStatus(chess);
    const allLegal = getLegalMoves(chess);
    const players = createInitialPlayers(config);
    const initialMs = TIME_PRESETS[config.timePreset].initialMs;
    const neuralMachine = new NeuralStateMachine();
    neuralMachine.onEvent({ type: 'TURN_START' });

    set({
      screen: 'GAME',
      camera: 'BOARD',
      paused: false,
      config,
      chess,
      fen: chess.fen(),
      pieces,
      currentSeat: 0,
      turn: 'w',
      phase: 'READY',
      status,
      selectedSquare: null,
      legalMovesForSelected: [],
      allLegalMoves: allLegal,
      moveHistory: [],
      lastMoveAt: 0,
      pendingPromotion: null,
      clocks: { 0: initialMs, 1: initialMs },
      lastClockTick: Date.now(),
      players,
      winner: null,
      carry: null,
      carrySample: null,
      aiThinking: false,
      aiMetrics: null,
      neuralMachine,
      neuralState: neuralMachine.state,
      decision: computeNeuralDecision(chess, 0, config.aiLevel),
      crowd: { excitement: 0.15 },
    });
  },

  selectSquare: (square) => {
    const { phase, currentSeat, players, allLegalMoves, chess } = get();
    if (phase !== 'READY' && phase !== 'PIECE_SELECTED') return;

    const currentPlayer = players[currentSeat];
    if (currentPlayer.controller !== 'HUMAN') return;

    if (!square) {
      set({ selectedSquare: null, legalMovesForSelected: [], phase: 'READY' });
      return;
    }

    // Check if clicking a legal destination of an already selected piece
    const { selectedSquare, legalMovesForSelected } = get();
    if (selectedSquare) {
      const move = legalMovesForSelected.find((m) => m.to === square);
      if (move) {
        get().requestMove(selectedSquare, square);
        return;
      }
    }

    // Otherwise, select piece on square if it belongs to current player
    const piece = chess.get(square);
    const myColor = currentSeat === 0 ? 'w' : 'b';
    if (piece && piece.color === myColor) {
      const legal = allLegalMoves.filter((m) => m.from === square);
      get().emitNeuralEvent({ type: 'PIECE_SELECTED', square });
      set({
        selectedSquare: square,
        legalMovesForSelected: legal,
        phase: 'PIECE_SELECTED',
      });
    } else {
      // A tap that is neither a legal destination nor one of your own
      // pieces. Say so quietly rather than silently dropping the selection,
      // which on a touch screen just looks like the tap missed.
      if (selectedSquare) get().notify('Not a legal move', 'WARN');
      set({ selectedSquare: null, legalMovesForSelected: [], phase: 'READY' });
    }
  },

  requestMove: (from, to) => {
    const { chess } = get();
    const piece = chess.get(from);
    if (!piece) return;

    // Check for pawn promotion
    const isPawn = piece.type === 'p';
    const isPromoting =
      isPawn &&
      ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

    if (isPromoting) {
      set({
        pendingPromotion: { from, to },
        phase: 'PROMOTION_DIALOG',
      });
      return;
    }

    get().executeMoveInternal(from, to);
  },

  choosePromotion: (promotionPiece) => {
    const { pendingPromotion } = get();
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    set({ pendingPromotion: null });
    get().executeMoveInternal(from, to, promotionPiece);
  },

  executeMoveInternal: (from, to, promotion) => {
    const { currentSeat, pieces } = get();

    // Identify moving piece
    const movingPiece = pieces.find((p) => p.square === from && !p.captured);
    if (!movingPiece) return;

    // Identify potential captured piece
    const targetPiece = pieces.find((p) => p.square === to && !p.captured);

    // Create CarryPlan
    const plan = createCarryPlan(currentSeat, movingPiece.id, from, to, {
      capturedPieceId: targetPiece?.id,
      timing: { carryMs: 600 },
    });

    get().emitNeuralEvent({ type: 'PIECE_GRAB', pieceId: movingPiece.id, square: from });

    set({
      carry: plan,
      phase: 'FLY_CARRY',
      selectedSquare: null,
      legalMovesForSelected: [],
      pendingPromotionPiece: promotion ?? null,
    });
  },

  sampleCarryFrame: (now) => {
    const { carry } = get();
    if (!carry) return;
    const sample = sampleCarry(carry, now);
    set({ carrySample: sample });
    if (sample.done) {
      get().completeCarry();
    }
  },

  completeCarry: () => {
    const {
      chess,
      carry,
      currentSeat,
      players,
      pieces,
      config,
    } = get();
    if (!carry) return;

    const { from, to } = carry;
    const movingPiece = pieces.find((p) => p.id === carry.pieceId);
    const promotion = movingPiece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? (get().pendingPromotionPiece || 'q') : undefined;

    // Execute move in authoritative chess engine
    const res = makeMove(chess, from, to, promotion);
    if (!res.move) {
      set({ carry: null, carrySample: null, phase: 'READY' });
      return;
    }

    const executed = res.move;
    const status = getStatus(chess);
    const allLegal = getLegalMoves(chess);

    // Update pieces state
    const nextPieces = pieces.map((p) => {
      if (p.id === carry.pieceId) {
        return {
          ...p,
          square: to,
          type: executed.promotion || p.type,
        };
      }
      if (executed.captured && p.square === to && !p.captured) {
        return {
          ...p,
          captured: true,
        };
      }
      // En passant capture
      if (executed.isEnPassant && !p.captured) {
        const epSquare = `${to[0]}${from[1]}`;
        if (p.square === epSquare) {
          return { ...p, captured: true };
        }
      }
      return p;
    });

    // Update player stats and captured list
    const updatedPlayers: [PlayerState, PlayerState] = [
      { ...players[0] },
      { ...players[1] },
    ];
    const currPlayer = updatedPlayers[currentSeat];
    currPlayer.stats.moves++;
    if (executed.captured) {
      currPlayer.stats.captures++;
      currPlayer.capturedPieces.push(executed.captured);
    }
    if (status.inCheck) {
      currPlayer.stats.checksGiven++;
    }

    // Add increment to clock if applicable
    const incMs = TIME_PRESETS[config.timePreset].incMs;
    if (incMs > 0 && currPlayer.clockMs > 0) {
      currPlayer.clockMs += incMs;
    }

    // Switch turn
    const nextSeat: SeatId = currentSeat === 0 ? 1 : 0;
    const nextTurn = chess.turn();

    // Neural events
    get().emitNeuralEvent({
      type: executed.isCheckmate
        ? 'CHECKMATE'
        : executed.isCheck
          ? 'CHECK'
          : executed.isCapture
            ? 'CAPTURE'
            : 'PIECE_RELEASE',
      square: to,
    });

    // Crowd reaction
    let excitement = 0.2;
    if (executed.isCheckmate) excitement = 1.0;
    else if (executed.isCheck) excitement = 0.7;
    else if (executed.isCapture) excitement = 0.5;

    let winnerSeat: SeatId | null = null;
    let nextPhase: GamePhase = 'READY';

    if (status.isOver) {
      nextPhase = 'GAME_OVER';
      if (status.isCheckmate) {
        winnerSeat = status.winner === 'w' ? 0 : 1;
      }
    }

    set({
      fen: chess.fen(),
      pieces: nextPieces,
      currentSeat: nextSeat,
      turn: nextTurn,
      phase: nextPhase,
      status,
      allLegalMoves: allLegal,
      moveHistory: [...get().moveHistory, executed],
      lastMoveAt: performance.now(),
      carry: null,
      carrySample: null,
      players: updatedPlayers,
      winner: winnerSeat,
      crowd: { excitement },
      decision: computeNeuralDecision(chess, nextSeat, config.aiLevel),
      lastClockTick: Date.now(),
    });

    if (status.inCheck || res.move.captured) {
      get().addPulse(status.isCheckmate ? 2.5 : status.inCheck ? 1.8 : 1.2);
    }
  },

  tickAi: async () => {
    const { phase, currentSeat, players, chess, aiThinking, status } = get();
    if (phase !== 'READY' || aiThinking || status.isOver) return;

    const currentPlayer = players[currentSeat];
    if (currentPlayer.controller !== 'AI') return;

    set({ aiThinking: true, phase: 'THINKING' });
    get().emitNeuralEvent({ type: 'BOARD_SCAN' });

    try {
      const searchResult: AiSearchResult = await computeAiMove(chess, currentPlayer.aiLevel);
      set({
        aiThinking: false,
        aiMetrics: {
          depth: searchResult.depth,
          nodes: searchResult.nodes,
          timeMs: searchResult.timeMs,
          score: searchResult.score,
        },
      });

      // Execute AI move
      get().requestMove(searchResult.move.from, searchResult.move.to);
    } catch (err) {
      console.error('AI search failed', err);
      set({ aiThinking: false, phase: 'READY' });
    }
  },

  undoMove: () => {
    const { chess, moveHistory, config } = get();
    if (config.mode !== 'HUMAN_VS_AI' || moveHistory.length === 0) return;

    // In Human vs AI, undo twice to step back to human's previous turn
    chess.undo();
    if (moveHistory.length >= 2) {
      chess.undo();
    }

    const pieces = extractPieces(chess);
    const status = getStatus(chess);
    const allLegal = getLegalMoves(chess);
    const remainingHistory = moveHistory.slice(0, Math.max(0, moveHistory.length - 2));

    set({
      chess,
      fen: chess.fen(),
      pieces,
      currentSeat: chess.turn() === 'w' ? 0 : 1,
      turn: chess.turn(),
      phase: 'READY',
      status,
      allLegalMoves: allLegal,
      moveHistory: remainingHistory,
      selectedSquare: null,
      legalMovesForSelected: [],
      carry: null,
      carrySample: null,
    });
  },

  tickClocks: (now) => {
    const { phase, currentSeat, players, clocks, lastClockTick, config } = get();
    if (phase === 'GAME_OVER' || config.timePreset === 'CASUAL') return;

    const delta = now - lastClockTick;
    const currentClock = clocks[currentSeat];
    if (currentClock <= 0) return;

    const nextClock = Math.max(0, currentClock - delta);
    const nextClocks = { ...clocks, [currentSeat]: nextClock };

    if (nextClock <= 0) {
      // Flag fall: opponent wins on time
      const oppSeat: SeatId = currentSeat === 0 ? 1 : 0;
      set({
        clocks: nextClocks,
        phase: 'GAME_OVER',
        winner: oppSeat,
        status: {
          ...get().status,
          isOver: true,
          statusText: `${players[oppSeat].name.toUpperCase()} WINS ON TIME`,
        },
      });
      return;
    }

    set({ clocks: nextClocks, lastClockTick: now });
  },

  emitNeuralEvent: (event) => {
    const { neuralMachine } = get();
    neuralMachine.onEvent(event);
    set({
      neuralState: neuralMachine.state,
      neuralActivity: (neuralMachine.state.attention + neuralMachine.state.decision + neuralMachine.state.motor) / 3,
    });
  },
}));
