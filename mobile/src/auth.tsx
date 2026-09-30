import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

  const refreshMe = useCallback(async () => { setMe(await api.get<Me>('/me')); }, []);

  useEffect(() => {
    (async () => {
      try { if (await loadSession()) await refreshMe(); }
      catch { await clearSession(); }
      setReady(true);
    })();
  }, [refreshMe]);

  useEffect(() => { if (me?.vault) registerPush(); }, [me?.vault?.id]);

  const start = async (path: string, body: object) => {
    const s = await api.post<{ token: string; refreshToken: string }>(path, body);
    await saveSession(s.token, s.refreshToken);
    await refreshMe();
  };

  const value: Ctx = {
    ready, me, refreshMe,
    signIn: (email, password) => start('/auth/login', { email, password }),
    signUp: (name, email, password) => start('/auth/register', { name, email, password }),
    signOut: async () => { await clearSession(); setMe(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
