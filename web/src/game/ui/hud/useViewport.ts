/**
 * Which shape of screen this is.
 *
 * One hook, one answer, so the layout cannot disagree with itself across
 * components -- a card that thinks it is on tablet next to a bar that thinks
 * it is on mobile is how HUDs end up overlapping.
 *
 * It reports a *kind* rather than raw pixels because that is what layout
 * decisions actually depend on, and it re-renders only when the kind or the
 * orientation changes, not on every resize pixel. A phone's address bar
 * sliding away fires a resize on almost every scroll frame.
 */

import { useEffect, useState } from 'react';

export type ViewportKind = 'MOBILE' | 'TABLET' | 'DESKTOP';

export interface Viewport {
  kind: ViewportKind;
  portrait: boolean;
  /** True for phones and tablets: no hover, bigger touch targets. */
  compact: boolean;
}

/** < 600 phone, 600-1024 tablet, above that desktop. */
function kindFor(width: number): ViewportKind {
  if (width < 600) return 'MOBILE';
  if (width <= 1024) return 'TABLET';
  return 'DESKTOP';
}

function read(): Viewport {
  if (typeof window === 'undefined') {
    return { kind: 'DESKTOP', portrait: false, compact: false };
  }
  const kind = kindFor(window.innerWidth);
  return {
    kind,
    portrait: window.innerHeight >= window.innerWidth,
    compact: kind !== 'DESKTOP',
  };
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(read);

  useEffect(() => {
    const onResize = () => {
      const next = read();
      // Only publish a real change. Otherwise the whole HUD re-renders every
      // time a mobile browser nudges the viewport height by a pixel.
      setViewport((current) =>
        current.kind === next.kind && current.portrait === next.portrait ? current : next,
      );
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return viewport;
}
