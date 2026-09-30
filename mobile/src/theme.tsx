import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Mode = 'system' | 'light' | 'dark';

const dark = {
  bg: '#0A1128', card: '#111B3B', cardAlt: '#17224A', border: '#223061',
  text: '#F4F6FF', muted: '#8C98C4', accent: '#2ED07C', onAccent: '#04210F',
  danger: '#FF6B6B', warn: '#F5B84B', blue: '#6C8CFF',
};
const light: typeof dark = {
  bg: '#F4F6FB', card: '#FFFFFF', cardAlt: '#EEF2FA', border: '#E1E6F2',
  text: '#0A1128', muted: '#66708F', accent: '#0FAE66', onAccent: '#FFFFFF',
  danger: '#D93F3F', warn: '#C98A12', blue: '#3B5BDB',
};
export type Colors = typeof dark;

type Ctx = { c: Colors; isDark: boolean; mode: Mode; setMode: (m: Mode) => void };
const ThemeCtx = createContext<Ctx>({ c: dark, isDark: true, mode: 'system', setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');
  useEffect(() => {
    SecureStore.getItemAsync('theme').then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); });
  }, []);
  const setMode = (m: Mode) => { setModeState(m); SecureStore.setItemAsync('theme', m); };
  const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';
  return <ThemeCtx.Provider value={{ c: isDark ? dark : light, isDark, mode, setMode }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
