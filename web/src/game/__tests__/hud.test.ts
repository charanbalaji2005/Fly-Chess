/**
 * Interface state, and the two ways it can go wrong.
 *
 * The HUD is mostly layout, which a test cannot judge. What it can judge is
 * the state behind it: that only one overlay is ever open, that a notice
 * cannot be dismissed by a stale timer belonging to an earlier one, and --
 * the one with teeth -- that resigning actually ends the game rather than
 * just relabelling it while the computer plays on.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { useGame } from '../store';
import { resolveBoardPalette } from './helpers';

function freshMatch() {
  useGame.getState().startMatch({
    mode: 'HUMAN_VS_AI',
    playerColor: 'WHITE',
    aiLevel: 'NORMAL',
    environment: 'SUN',
    timePreset: '5+0',
  });
}

describe('panels', () => {
  it('opens one at a time', () => {
    const { setUiPanel, togglePanel } = useGame.getState();
    setUiPanel('NONE');

    togglePanel('NEURAL');
    assert.strictEqual(useGame.getState().uiPanel, 'NEURAL');

    togglePanel('SETTINGS');
    assert.strictEqual(useGame.getState().uiPanel, 'SETTINGS', 'two drawers were open at once');
  });

  it('closes when its own button is pressed again', () => {
    const { setUiPanel, togglePanel } = useGame.getState();
    setUiPanel('NONE');
    togglePanel('NEURAL');
    togglePanel('NEURAL');
    assert.strictEqual(useGame.getState().uiPanel, 'NONE');
  });

  it('starts closed, so the board is unobstructed on load', () => {
    freshMatch();
    assert.strictEqual(useGame.getState().uiPanel, 'NONE');
  });
});

describe('notices', () => {
  it('shows one at a time and gives each a distinct id', () => {
    const { notify } = useGame.getState();
    notify('Check', 'BAD');
    const first = useGame.getState().notification;
    notify('Your turn', 'INFO');
    const second = useGame.getState().notification;

    if (!first || !second) return assert.fail('no notice was raised');
    assert.notStrictEqual(first.id, second.id);
    assert.strictEqual(second.text, 'Your turn');
  });

  it('a stale dismissal cannot swallow the notice that replaced it', () => {
    // the real sequence: notice A schedules its dismissal, B arrives first,
    // then A's timer fires. B must survive it.
    const { notify, dismissNotification } = useGame.getState();
    notify('First', 'INFO');
    const stale = useGame.getState().notification!.id;
    notify('Second', 'GOOD');

    dismissNotification(stale);
    assert.strictEqual(useGame.getState().notification?.text, 'Second');

    dismissNotification(useGame.getState().notification!.id);
    assert.strictEqual(useGame.getState().notification, null);
  });
});

describe('resigning', () => {
  it('ends the match rather than only relabelling it', () => {
    freshMatch();
    useGame.getState().resign();

    const s = useGame.getState();
    assert.ok(s.status.isOver, 'status not marked over');
    // The one that matters: the driver and the clock both key off the phase,
    // so a resignation that leaves it on READY lets the computer play on.
    assert.strictEqual(s.phase, 'GAME_OVER', 'the game would have carried on');
    assert.strictEqual(s.winner, 1, 'White resigned, so Black should win');
    assert.match(s.status.statusText, /resign/i);
  });

  it('puts down any piece that was in hand', () => {
    freshMatch();
    useGame.getState().selectSquare('e2');
    assert.ok(useGame.getState().legalMovesForSelected.length > 0);

    useGame.getState().resign();
    assert.strictEqual(useGame.getState().selectedSquare, null);
    assert.strictEqual(useGame.getState().legalMovesForSelected.length, 0);
  });

  it('refuses to fire twice', () => {
    freshMatch();
    useGame.getState().resign();
    const winner = useGame.getState().winner;

    useGame.getState().resign();
    assert.strictEqual(useGame.getState().winner, winner, 'a second resign changed the result');
  });

  it('leaves the computer nothing to do', async () => {
    freshMatch();
    useGame.getState().resign();
    await useGame.getState().tickAi();
    assert.strictEqual(useGame.getState().aiThinking, false, 'the AI started searching anyway');
  });
});

describe('board readability', () => {
  it('keeps every piece distinct from the square it stands on', () => {
    // The defect this catches: light squares drifting close enough to the
    // white pieces that a bishop on a light square stops being a shape.
    const { light, dark, white, black } = resolveBoardPalette();

    assert.ok(
      white - light > 0.1,
      `white pieces (${white.toFixed(2)}) too close to light squares (${light.toFixed(2)})`,
    );
    assert.ok(
      dark - black > 0.04,
      `black pieces (${black.toFixed(2)}) too close to dark squares (${dark.toFixed(2)})`,
    );
    // and the chequer itself has to be obvious
    assert.ok(light - dark > 0.3, 'the two square colours are too close together');
  });
});
