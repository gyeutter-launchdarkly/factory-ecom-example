'use client';

import { useEffect, useState } from 'react';

// Light/dark switch. The actual theme lives in a `data-theme` attribute on
// <html>, applied before paint by the inline script in layout.tsx so there is
// no flash on load. This component only mirrors and updates it.

export const THEME_KEY = 'darkcommerce-theme';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  // Light is the default, matching the server-rendered attribute.
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'dark' ? 'dark' : 'light');
    setReady(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing with storage disabled: the theme still applies for
      // this page view, it just will not persist.
    }
  };

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-pill flex items-center justify-center text-[13px] text-muted hover:text-ink hover:bg-shell transition-colors"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {/* Until mounted, render a neutral glyph so SSR and client agree. */}
      <span aria-hidden>{ready ? (theme === 'dark' ? '☀' : '☾') : '☾'}</span>
    </button>
  );
}
