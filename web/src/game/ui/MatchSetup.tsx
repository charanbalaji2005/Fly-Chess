/**
 * Match Setup Dialog for Drosophila Neural Chess.
 */

import { useState } from 'react';
import { useGame } from '../store';
import type { AiLevel, GameMode, PlayerColor, TimePreset } from '../types';
import { Card, GameButton } from './kit';

interface AiLevelOption {
  level: AiLevel;
  title: string;
  elo: string;
  badge: string;
  desc: string;
  depth: string;
  accent: string;
  borderActive: string;
  bgActive: string;
  tagBg: string;
  icon: string;
}

const AI_LEVELS: AiLevelOption[] = [
  {
    level: 'BEGINNER',
    title: 'Beginner',
    elo: 'Elo ~600',
    badge: 'Novice',
    desc: 'Random legal moves with gentle pawn pushes. Perfect for learning Drosophila carry controls.',
    depth: '1-Ply',
    accent: '#34d399',
    borderActive: 'border-emerald-400',
    bgActive: 'bg-emerald-950/50',
    tagBg: 'bg-emerald-500/20 text-emerald-300',
    icon: '🌱',
  },
  {
    level: 'EASY',
    title: 'Easy',
    elo: 'Elo ~1000',
    badge: 'Casual',
    desc: '1-ply greedy captures and basic check evasion. Punishes blatant blunders.',
    depth: '1–2 Ply',
    accent: '#38bdf8',
    borderActive: 'border-sky-400',
    bgActive: 'bg-sky-950/50',
    tagBg: 'bg-sky-500/20 text-sky-300',
    icon: '⚡',
  },
  {
    level: 'NORMAL',
    title: 'Normal',
    elo: 'Elo ~1400',
    badge: 'Club',
    desc: '2-ply minimax with piece-square positional tables and active center control.',
    depth: '2–3 Ply',
    accent: '#60a5fa',
    borderActive: 'border-blue-400',
    bgActive: 'bg-blue-950/50',
    tagBg: 'bg-blue-500/20 text-blue-300',
    icon: '🛡️',
  },
  {
    level: 'HARD',
    title: 'Hard',
    elo: 'Elo ~1800',
    badge: 'Tournament',
    desc: '3-ply alpha-beta pruning with king safety, piece mobility, and endgame tables.',
    depth: '3–4 Ply',
    accent: '#fbbf24',
    borderActive: 'border-amber-400',
    bgActive: 'bg-amber-950/50',
    tagBg: 'bg-amber-500/20 text-amber-300',
    icon: '🎯',
  },
  {
    level: 'EXPERT',
    title: 'Expert',
    elo: 'Elo ~2100',
    badge: 'Grandmaster',
    desc: '4-ply deep search with tactical quiescence search and move ordering heuristics.',
    depth: '4–5 Ply',
    accent: '#c084fc',
    borderActive: 'border-purple-400',
    bgActive: 'bg-purple-950/50',
    tagBg: 'bg-purple-500/20 text-purple-300',
    icon: '🔮',
  },
  {
    level: 'MASTER',
    title: 'Master',
    elo: 'Elo ~2400+',
    badge: 'Supercore',
    desc: 'Deep iterative deepening with Drosophila connectome neural evaluation network.',
    depth: '5–6+ Ply',
    accent: '#fb7185',
    borderActive: 'border-rose-400',
    bgActive: 'bg-rose-950/50',
    tagBg: 'bg-rose-500/20 text-rose-300',
    icon: '👑',
  },
];

export function MatchSetup() {
  const config = useGame((s) => s.config);
  const startMatch = useGame((s) => s.startMatch);
  const setScreen = useGame((s) => s.setScreen);
  const updateSettings = useGame((s) => s.updateSettings);
  const settings = useGame((s) => s.settings);

  const [mode, setMode] = useState<GameMode>(config.mode === 'AI_VS_AI' ? 'AI_VS_AI' : 'HUMAN_VS_AI');
  const [playerColor, setPlayerColor] = useState<PlayerColor | 'RANDOM'>(config.playerColor);
  const [aiLevel, setAiLevel] = useState<AiLevel>(config.aiLevel);
  const [environment, setEnvironment] = useState<'SUN' | 'NIGHT'>(settings.environment);
  const [timePreset, setTimePreset] = useState<TimePreset>(config.timePreset);

  const handleStart = () => {
    updateSettings({ environment });
    startMatch({
      mode,
      playerColor: mode === 'HUMAN_VS_AI' ? playerColor : 'WHITE',
      aiLevel,
      environment,
      timePreset,
    });
  };

  const selectedLevelObj = AI_LEVELS.find((l) => l.level === aiLevel) ?? AI_LEVELS[3];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <Card style={{ width: 'min(640px, 95vw)', maxHeight: '92vh', overflowY: 'auto' }} className="p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-wide text-white flex items-center gap-2">
              <span className="text-sky-400">Drosophila</span> Neural Match Setup
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose your match type, neural AI hardness level, and stadium parameters.
            </p>
          </div>
          <button
            onClick={() => setScreen('MENU')}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded bg-slate-800/60"
          >
            ✕ Close
          </button>
        </div>

        {/* 1. Game Mode */}
        <div className="mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Game Mode
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {[
              { id: 'HUMAN_VS_AI' as const, label: 'Human vs Fly AI', desc: 'Command your pieces against the neural engine' },
              { id: 'AI_VS_AI' as const, label: 'AI vs AI (Spectator)', desc: 'Sit in the stands and watch two neural models battle' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  mode === m.id
                    ? 'border-sky-400 bg-sky-950/60 text-white shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${mode === m.id ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`} />
                  {m.label}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {m.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Player Color (if Human vs AI) */}
        {mode === 'HUMAN_VS_AI' && (
          <div className="mb-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your Color
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['WHITE', 'BLACK', 'RANDOM'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setPlayerColor(c)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold tracking-wide transition-all ${
                    playerColor === c
                      ? 'border-sky-400 bg-sky-950/60 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {c === 'WHITE' ? '♔ Play White' : c === 'BLACK' ? '♚ Play Black' : '🎲 Random'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. AI Difficulty / Hardness (6 genuine levels) */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>Levels of Hardness</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedLevelObj.tagBg}`}>
                Active: {selectedLevelObj.title} ({selectedLevelObj.elo})
              </span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">Real-time Search Depth</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {AI_LEVELS.map((item) => {
              const isSelected = aiLevel === item.level;
              return (
                <button
                  key={item.level}
                  onClick={() => setAiLevel(item.level)}
                  className={`flex flex-col text-left rounded-xl border p-3 transition-all relative overflow-hidden ${
                    isSelected
                      ? `${item.borderActive} ${item.bgActive} text-white shadow-[0_0_16px_rgba(0,0,0,0.5)]`
                      : 'border-slate-800/80 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:bg-slate-900/70'
                  }`}
                  style={{
                    boxShadow: isSelected ? `0 0 16px ${item.accent}33` : undefined,
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{item.icon}</span>
                      <div>
                        <span className="font-bold text-xs text-white tracking-wide">
                          {item.title}
                        </span>
                        <span className="ml-1.5 text-[10px] font-mono text-slate-400">
                          {item.elo}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                        isSelected
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-slate-700 bg-slate-800/60 text-slate-400'
                      }`}
                    >
                      {item.depth}
                    </span>
                  </div>
                  <span className="mt-2 text-[11px] leading-relaxed text-slate-300/80">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Stadium Environment & Time Control */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Stadium Sky
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['SUN', 'NIGHT'] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEnvironment(e)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                    environment === e
                      ? 'border-amber-400 bg-amber-950/60 text-amber-200'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {e === 'SUN' ? '☀️ Sun Sky' : '🌙 Night Sky'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Time Control
            </label>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value as TimePreset)}
              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              <option value="CASUAL">Casual (No Clock)</option>
              <option value="1+0">1 min Bullet</option>
              <option value="3+0">3 min Blitz</option>
              <option value="5+0">5 min Blitz</option>
              <option value="10+0">10 min Rapid</option>
              <option value="15+10">15 | 10 Rapid</option>
              <option value="30+0">30 min Classical</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <GameButton full onClick={() => setScreen('MENU')}>
            Cancel
          </GameButton>
          <GameButton variant="primary" full size="lg" onClick={handleStart}>
            Start Match
          </GameButton>
        </div>
      </Card>
    </div>
  );
}
