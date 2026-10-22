import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react';
import {supportsUnicode} from '../lib/terminal';
import {applyGlyphs, themes} from './themes';
import {themeNames, type Theme, type ThemeName, type Tone} from './tokens';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (name: ThemeName) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.dark,
  setTheme() {},
  cycleTheme() {},
});

export function ThemeProvider({
  name = 'dark',
  ascii = !supportsUnicode(),
  children,
}: {
  name?: ThemeName;
  ascii?: boolean;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<ThemeName>(name);
  const locked = process.env.NO_COLOR !== undefined;

  const theme = useMemo(
    () => applyGlyphs(themes[locked ? 'mono' : current], ascii),
    [current, ascii, locked],
  );

  const cycleTheme = useCallback(() => {
    if (!locked) setCurrent((c) => themeNames[(themeNames.indexOf(c) + 1) % themeNames.length]!);
  }, [locked]);

  const value = useMemo(() => ({theme, setTheme: setCurrent, cycleTheme}), [theme, cycleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext).theme;
export const useThemeControls = () => useContext(ThemeContext);

/** Text props for a tone. Muted falls back to dim in mono mode. */
export function useTone(tone: Tone) {
  const t = useTheme();

  return {color: t.color[tone], dimColor: t.mono && tone === 'muted'};
}
