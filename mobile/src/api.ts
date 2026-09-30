import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';
let token: string | null = null;
let refreshToken: string | null = null;

export async function loadSession() {
  token = await SecureStore.getItemAsync('token');
  refreshToken = await SecureStore.getItemAsync('refresh');
  return !!token;
}
export async function saveSession(t: string, r: string) {
  token = t; refreshToken = r;
  await SecureStore.setItemAsync('token', t);
  await SecureStore.setItemAsync('refresh', r);
}
export async function clearSession() {
  token = null; refreshToken = null;
  await SecureStore.deleteItemAsync('token');
  await SecureStore.deleteItemAsync('refresh');
}

async function raw(method: string, path: string, body?: unknown) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    return await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(timer); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try { res = await raw(method, path, body); }
  catch { throw new Error('Cannot reach the server. Check your connection.'); }

  if (res.status === 401 && refreshToken && !path.startsWith('/auth')) {
    const r = await raw('POST', '/auth/refresh', { refreshToken });
    if (r.ok) {
      const s = await r.json();
      await saveSession(s.token, s.refreshToken);
      res = await raw(method, path, body);
    }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
  return json as T;
}

export const api = {
  get: <T,>(p: string) => request<T>('GET', p),
  post: <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T,>(p: string, b: unknown) => request<T>('PATCH', p, b),
  put: <T,>(p: string, b: unknown) => request<T>('PUT', p, b),
};
