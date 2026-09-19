/**
 * Application shell.
 *
 * Two halves of one product:
 *
 *   Drosophila Neural Ludo   the game -- a circular stadium, four flies, a
 *                            neural core at the centre
 *   Neural Lab               the instrument -- the measured FlyWire connectome
 *                            and the repository's spiking model
 *
 * The game opens first, because it plays without waiting for anything; the Lab
 * is a click away from its menu and downloads its ~8 MB of connectome only
 * when asked.
 *
 * Only one is mounted at a time, which keeps a hidden WebGL canvas from
 * burning a GPU in the background. Nothing is lost by that: both halves keep
 * their state in stores that live outside React, so a match in progress and a
 * parsed connectome both survive the switch.
 */

import { useState } from 'react';

import { GameApp } from './game/GameApp';
import { LabApp } from './LabApp';

type View = 'GAME' | 'LAB';

export default function App() {
  const [view, setView] = useState<View>('GAME');

  if (view === 'LAB') {
    return <LabApp onExit={() => setView('GAME')} />;
  }

  return <GameApp onOpenLab={() => setView('LAB')} />;
}
