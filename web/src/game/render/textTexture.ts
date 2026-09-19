/**
 * Crisp text as a texture.
 *
 * Three.js has no text primitive and a font loader would mean shipping a
 * typeface for eight letters and eight digits. A 2D canvas is smaller, sharp
 * at any size, and -- the part that matters here -- gives glyphs that read
 * correctly rather than the blank grey quads the board coordinates used to
 * be drawn with.
 *
 * Textures are cached by their full description, so the sixteen board
 * coordinates cost sixteen small canvases once, not one per frame.
 */

import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

export interface TextTextureOptions {
  /** Pixel height of the canvas; width follows the aspect. */
  size?: number;
  aspect?: number;
  color?: string;
  /** Transparent by default, so a label sits on whatever is behind it. */
  background?: string;
  weight?: number;
  /** Fraction of the canvas height the glyphs occupy. */
  fill?: number;
  letterSpacing?: number;
  family?: string;
}

const cache = new Map<string, CanvasTexture>();

export function textTexture(text: string, options: TextTextureOptions = {}): CanvasTexture {
  const {
    size = 128,
    aspect = 1,
    color = '#ffffff',
    background,
    weight = 700,
    fill = 0.62,
    letterSpacing = 0,
    family = 'Inter, ui-sans-serif, system-ui, sans-serif',
  } = options;

  const key = [text, size, aspect, color, background, weight, fill, letterSpacing, family].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.height = size;
  canvas.width = Math.max(1, Math.round(size * aspect));

  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.font = `${weight} ${Math.round(size * fill)}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // `letterSpacing` is not in the older DOM typings but is widely supported;
    // without it the tracking simply stays at zero, which is fine.
    if (letterSpacing) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacing}px`;
    }
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + size * 0.02);
  }

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}
