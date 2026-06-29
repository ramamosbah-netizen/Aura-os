'use client';

import { type CSSProperties, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

/**
 * Dark/light theme toggle. Flips `data-theme` on <html> (which swaps the CSS variables
 * in globals.css) and persists the choice. Defaults to dark; reads the saved value on mount.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('aura-theme') as Theme | null) ?? 'dark';
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('aura-theme', next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-label="Toggle theme"
      style={btn}
    >
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  );
}

const btn: CSSProperties = {
  marginLeft: 12,
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 15,
  flexShrink: 0,
};
