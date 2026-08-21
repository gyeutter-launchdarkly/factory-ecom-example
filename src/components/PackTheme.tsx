'use client';

import { useEffect } from 'react';
import { useDemoPack } from '@/lib/use-demo-pack';

// A pack's palette is data, so it is applied as CSS variables at runtime rather
// than as a stylesheet per customer. Two sets are written: --pack-* for the
// pack storefront's own chrome, and the app's own --c-* tokens so shared pages
// (cart, checkout) follow the same palette instead of staying pale pink.

/** "#ffcd11" | "#fc1" -> "255 205 17", the triple form the app's tokens use. */
function triple(hex: string): string | null {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

const PACK_VARS: Record<string, string> = {
  surface: '--pack-surface',
  shell: '--pack-shell',
  ink: '--pack-ink',
  muted: '--pack-muted',
  hairline: '--pack-border',
  accent: '--pack-accent',
  accentInk: '--pack-accent-ink',
  headerBg: '--pack-header-bg',
  headerInk: '--pack-header-ink',
  topBarBg: '--pack-topbar-bg',
};

// Pack key -> the app token it should stand in for, as an RGB triple.
const APP_VARS: Record<string, string> = {
  page: '--c-ground',
  surface: '--c-surface',
  shell: '--c-shell',
  ink: '--c-ink',
  muted: '--c-muted',
  hairline: '--c-hair',
  accent: '--c-rose',
  accentWash: '--c-blush',
};

export function PackTheme() {
  const pack = useDemoPack();
  const theme = pack.storefront?.theme;

  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];

    if (!theme) {
      delete root.dataset.packStore;
      return;
    }

    root.dataset.packStore = pack.id;
    // A pack store is designed against its own light palette, so the app's dark
    // mode must not repaint half of it.
    root.dataset.theme = 'light';

    for (const [key, value] of Object.entries(theme)) {
      const packVar = PACK_VARS[key];
      if (packVar) {
        root.style.setProperty(packVar, value);
        applied.push(packVar);
      }
      const appVar = APP_VARS[key];
      const rgb = appVar ? triple(value) : null;
      if (appVar && rgb) {
        root.style.setProperty(appVar, rgb);
        applied.push(appVar);
      }
    }

    if (theme.accentText) {
      root.style.setProperty('--rose-text', theme.accentText);
      applied.push('--rose-text');
    }
    if (theme.fontFamily) {
      root.style.setProperty('--pack-font', theme.fontFamily);
      applied.push('--pack-font');
    }

    return () => {
      for (const name of applied) root.style.removeProperty(name);
      delete root.dataset.packStore;
    };
  }, [pack.id, theme]);

  return null;
}
