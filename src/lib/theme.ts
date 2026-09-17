/**
 * Light and dark — SPEC §8.
 *
 * The palette lives in CSS variables (index.css); this only decides which set is active by
 * stamping `data-theme` on the root element. "System" follows Windows and keeps following
 * it if Windows switches at sunset.
 */
import { useEffect, useState } from 'react';
import { rememberThemeHint } from '../db/repo';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

/** The browser chrome colour for each theme — the page ground, `ink`. */
const CHROME: Record<Theme, string> = { light: '#F7F9F7', dark: '#0B0E0D' };

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** Applies the preference and returns the theme in force. */
export function useTheme(pref: ThemePref | undefined): Theme {
  const query = '(prefers-color-scheme: dark)';
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const follow = (): void => setSystemDark(media.matches);
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const theme = resolveTheme(pref ?? 'light', systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
    rememberThemeHint(theme);
  }, [theme]);

  return theme;
}
