'use client';

// components/theme-toggle.tsx — the ☀/☾ switch.
// Default: whatever your operating system prefers. Your choice is remembered
// (localStorage) and applied by adding/removing `theme-dark` on <html>.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'zl-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: 'light' | 'dark' =
      stored === 'dark' || stored === 'light'
        ? stored
        : systemPrefersDark
          ? 'dark'
          : 'light';
    document.documentElement.classList.toggle('theme-dark', initial === 'dark');
    setTheme(initial);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.classList.toggle('theme-dark', next === 'dark');
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-cream shadow-lg transition-colors hover:border-ember/50"
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span>
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
