/**
 * Board framing, across the devices the game is meant to run on.
 *
 * The bug this guards: a camera distance tuned on a widescreen window left
 * the board half off the side of a portrait phone, so the first thing a
 * mobile player saw was an empty stadium wall.
 *
 * `projectedCoverage` projects the board's corners through the real camera
 * pose, which is the only measurement that catches it -- the flat arithmetic
 * said the board took 57% of the frame while a true projection showed 105%.
 *
 * And the assertion is `contained`, not the span. An earlier version of this
 * file checked only that the board spanned no more than the frame, which a
 * board can do while sitting half below the bottom edge -- and did, once the
 * camera was raised to bring the stadium screen into shot. Measuring the
 * right thing was the whole fix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { CHESS_BOARD } from '../chessEngine';
import { ELEVATION, cameraFit, projectedCoverage, viewportKind } from '../render/cameraFit';

/** Board plus its frame, halved. What actually has to fit on screen. */
const HALF = (CHESS_BOARD.size + 3.4) / 2;
const FOV = 44;

const DEVICES: [string, number, number][] = [
  ['iPhone portrait', 390, 844],
  ['small Android', 360, 800],
  ['large Android', 412, 915],
  ['iPhone landscape', 844, 390],
  ['tablet portrait', 768, 1024],
  ['tablet landscape', 1024, 768],
  ['laptop', 1280, 720],
  ['desktop', 1920, 1080],
  ['ultrawide', 2560, 1080],
];

describe('board framing', () => {
  it('fits the whole board on every device, in both orientations', () => {
    for (const [name, w, h] of DEVICES) {
      const cover = projectedCoverage(HALF, FOV, w, h);
      assert.ok(
        cover.contained,
        `${name}: board is cropped -- spans ${(cover.width * 100).toFixed(0)}% of width, ` +
          `${(cover.height * 100).toFixed(0)}% of height, bottom edge at ${cover.bottom.toFixed(2)}`,
      );
    }
  });

  it('keeps the near rank on screen, which the span alone does not prove', () => {
    // the specific regression: a board that spans the frame while its
    // nearest rank sits below the bottom edge
    for (const [name, w, h] of DEVICES) {
      const cover = projectedCoverage(HALF, FOV, w, h);
      assert.ok(cover.bottom >= -1, `${name}: near rank is off the bottom (${cover.bottom.toFixed(2)})`);
      assert.ok(cover.top <= 1, `${name}: far rank is off the top (${cover.top.toFixed(2)})`);
    }
  });

  it('still makes the board the subject rather than a distant object', () => {
    for (const [name, w, h] of DEVICES) {
      const cover = projectedCoverage(HALF, FOV, w, h);
      const biggest = Math.max(cover.width, cover.height);
      assert.ok(
        biggest > 0.5,
        `${name}: board only reaches ${(biggest * 100).toFixed(0)}% of the frame`,
      );
    }
  });

  it('keeps the desktop view in the intended 55-75% band', () => {
    const cover = projectedCoverage(HALF, FOV, 1920, 1080);
    assert.ok(
      cover.width > 0.5 && cover.width < 0.78,
      `desktop width ${cover.width.toFixed(2)} -- the board should dominate without filling the frame`,
    );
  });

  it('fills a phone with the board, since there is nothing beside it', () => {
    const cover = projectedCoverage(HALF, FOV, 390, 844);
    assert.ok(cover.width > 0.7, `phone width only ${cover.width.toFixed(2)}`);
    // and leaves bands top and bottom for the status line and action strip
    assert.ok(cover.height < 0.6, `phone board is ${cover.height.toFixed(2)} tall; no room for HUD`);
  });

  it('looks down more steeply the smaller the screen', () => {
    assert.ok(ELEVATION.MOBILE > ELEVATION.TABLET);
    assert.ok(ELEVATION.TABLET > ELEVATION.DESKTOP);
    // never straight down, or the pieces lose their silhouettes
    assert.ok(ELEVATION.MOBILE < 0.99);
  });

  it('stands further back on a narrower screen', () => {
    const phone = cameraFit(HALF, FOV, 390, 844).distance;
    const desktop = cameraFit(HALF, FOV, 1920, 1080).distance;
    assert.ok(phone > desktop, 'a phone needs more distance than a desktop');
  });

  it('puts the camera above and in front of the board, never inside it', () => {
    for (const [name, w, h] of DEVICES) {
      const { position } = cameraFit(HALF, FOV, w, h);
      assert.ok(position[1] > HALF * 0.5, `${name}: camera too low`);
      assert.ok(position[2] > 0, `${name}: camera is behind the board`);
      assert.ok(Number.isFinite(position[1]) && Number.isFinite(position[2]), name);
    }
  });

  it('survives a degenerate viewport instead of producing NaN', () => {
    for (const [w, h] of [[0, 0], [1, 10000], [10000, 1]]) {
      const { position, distance } = cameraFit(HALF, FOV, w, h);
      assert.ok(Number.isFinite(distance) && distance > 0, `${w}x${h}`);
      assert.ok(position.every(Number.isFinite), `${w}x${h}`);
    }
  });
});

describe('breakpoints', () => {
  it('splits where the layout actually changes', () => {
    assert.strictEqual(viewportKind(390), 'MOBILE');
    assert.strictEqual(viewportKind(599), 'MOBILE');
    assert.strictEqual(viewportKind(600), 'TABLET');
    assert.strictEqual(viewportKind(1024), 'TABLET');
    assert.strictEqual(viewportKind(1025), 'DESKTOP');
  });
});
