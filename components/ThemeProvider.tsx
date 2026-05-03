// SoundSage — ThemeProvider
// Owns user-tunable client preferences: theme, density, accent colour,
// number format, and reduce-motion. Each value persists in localStorage
// and is exposed via the useTheme() context so any client component can
// read or write it.
//
// Server render uses the props passed in (defaults below) to keep the
// initial HTML stable. On mount we hydrate from localStorage and re-apply
// if the stored values differ — wrapped in `no-transitions` for the swap
// so the page doesn't flash mid-paint.

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import type {
  TabId,
  ThemeId,
  DensityId,
  AccentId,
  NumberFormatId,
} from '../types';

const TAB_FROM_PATH: Record<string, TabId> = {
  '/':          'overview',
  '/history':   'history',
  '/patterns':  'patterns',
  '/tracks':    'tracks',
  '/artists':   'artists',
};

const STORAGE = {
  theme:        'soundsage:theme',
  density:      'soundsage:density',
  accent:       'soundsage:accent',
  numberFormat: 'soundsage:number-format',
  reduceMotion: 'soundsage:reduce-motion',
} as const;

const VALID_THEMES:        readonly ThemeId[]        = ['paper', 'midnight'];
const VALID_DENSITIES:     readonly DensityId[]      = ['compact', 'regular', 'roomy'];
const VALID_ACCENTS:       readonly AccentId[]       = ['ink', 'ember', 'seal', 'moss'];
const VALID_NUMBER_FORMAT: readonly NumberFormatId[] = ['grouped', 'plain'];

interface ThemeContextValue {
  theme:        ThemeId;
  density:      DensityId;
  accent:       AccentId;
  numberFormat: NumberFormatId;
  reduceMotion: boolean;
  setTheme:        (t: ThemeId)        => void;
  setDensity:      (d: DensityId)      => void;
  setAccent:       (a: AccentId)       => void;
  setNumberFormat: (f: NumberFormatId) => void;
  setReduceMotion: (b: boolean)        => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read every user pref (and its setter) from anywhere inside the tree. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be called inside <ThemeProvider>');
  }
  return ctx;
}

interface ThemeProviderProps {
  /** Server-side default — used for the initial paint to avoid hydration drift. */
  theme?:   ThemeId;
  density?: DensityId;
  children: React.ReactNode;
}

export function ThemeProvider({
  theme:   initialTheme   = 'paper',
  density: initialDensity = 'regular',
  children,
}: ThemeProviderProps) {
  const pathname = usePathname();
  const tab      = TAB_FROM_PATH[pathname] ?? 'overview';

  const [theme,        setThemeState]        = useState<ThemeId>(initialTheme);
  const [density,      setDensityState]      = useState<DensityId>(initialDensity);
  const [accent,       setAccentState]       = useState<AccentId>('ink');
  const [numberFormat, setNumberFormatState] = useState<NumberFormatId>('grouped');
  const [reduceMotion, setReduceMotionState] = useState<boolean>(false);

  // ─── Hydrate from localStorage on mount ─────────────────────────────────
  useEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE.theme)        as ThemeId        | null;
      const d = localStorage.getItem(STORAGE.density)      as DensityId      | null;
      const a = localStorage.getItem(STORAGE.accent)       as AccentId       | null;
      const n = localStorage.getItem(STORAGE.numberFormat) as NumberFormatId | null;
      const m = localStorage.getItem(STORAGE.reduceMotion);
      if (t && (VALID_THEMES        as readonly string[]).includes(t)) setThemeState(t);
      if (d && (VALID_DENSITIES     as readonly string[]).includes(d)) setDensityState(d);
      if (a && (VALID_ACCENTS       as readonly string[]).includes(a)) setAccentState(a);
      if (n && (VALID_NUMBER_FORMAT as readonly string[]).includes(n)) setNumberFormatState(n);
      if (m === '1') setReduceMotionState(true);
    } catch {
      // localStorage may be disabled (private mode, embedded webview, etc.).
      // Silent fallback to the default values is correct behaviour.
    }
  }, []);

  // ─── Apply data-* attributes to <html> ──────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('no-transitions');
    root.dataset.theme        = theme;
    root.dataset.density      = density;
    root.dataset.tab          = tab;
    root.dataset.accent       = accent;
    root.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
    requestAnimationFrame(() => {
      root.classList.remove('no-transitions');
    });
  }, [theme, density, tab, accent, reduceMotion]);

  // ─── Setters that also persist ──────────────────────────────────────────
  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE.theme, t); } catch {}
  }, []);

  const setDensity = useCallback((d: DensityId) => {
    setDensityState(d);
    try { localStorage.setItem(STORAGE.density, d); } catch {}
  }, []);

  const setAccent = useCallback((a: AccentId) => {
    setAccentState(a);
    try { localStorage.setItem(STORAGE.accent, a); } catch {}
  }, []);

  const setNumberFormat = useCallback((f: NumberFormatId) => {
    setNumberFormatState(f);
    try { localStorage.setItem(STORAGE.numberFormat, f); } catch {}
  }, []);

  const setReduceMotion = useCallback((b: boolean) => {
    setReduceMotionState(b);
    try { localStorage.setItem(STORAGE.reduceMotion, b ? '1' : '0'); } catch {}
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme, density, accent, numberFormat, reduceMotion,
        setTheme, setDensity, setAccent, setNumberFormat, setReduceMotion,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
