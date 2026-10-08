import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, clearSession, loadSession, saveSession } from './api';
import { registerPush } from './push';
import { Me } from './types';

type Ctx = {
  ready: boolean; me: Me | null;
  refreshMe: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refreshMe = useCallback(async () => {
    const data = await api.get<Me>('/me');
    setMe(data);
    await SecureStore.setItemAsync('duo_cached_me', JSON.stringify(data)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const hasSession = await loadSession();
        if (hasSession) {
          const cached = await SecureStore.getItemAsync('duo_cached_me').catch(() => null);
          if (cached) {
            try { setMe(JSON.parse(cached)); } catch {}
          }
          setReady(true);
          refreshMe().catch(() => {});
          return;
        }
      } catch {
        await clearSession();
      }
      setReady(true);
    })();
  }, [refreshMe]);

  useEffect(() => { if (me?.vault) registerPush(); }, [me?.vault?.id]);

  const start = async (path: string, body: object) => {
    const s = await api.post<{ token: string; refreshToken: string; me?: Me }>(path, body);
    await saveSession(s.token, s.refreshToken);
    if (s.me) {
      setMe(s.me);
      await SecureStore.setItemAsync('duo_cached_me', JSON.stringify(s.me)).catch(() => {});
    } else {
      await refreshMe();
    }
  };

  const value: Ctx = {
    ready, me, refreshMe,
    signIn: (email, password) => start('/auth/login', { email, password }),
    signUp: (name, email, password) => start('/auth/register', { name, email, password }),
    signOut: async () => {
      await clearSession();
      await SecureStore.deleteItemAsync('duo_cached_me').catch(() => {});
      setMe(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
