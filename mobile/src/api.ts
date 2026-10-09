import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://backend-wheat-six-65.vercel.app/api';
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
let onUnauthorizedCallback: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void) {
  onUnauthorizedCallback = cb;
}

export async function clearSession() {
  token = null; refreshToken = null;
  clearApiCache();
  await SecureStore.deleteItemAsync('token').catch(() => {});
  await SecureStore.deleteItemAsync('refresh').catch(() => {});
  onUnauthorizedCallback?.();
}

async function raw(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && !path.startsWith('/auth')) headers['Authorization'] = `Bearer ${token}`;

  return await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await raw(method, path, body);
  } catch (e: any) {
    console.warn(`[API] Failed: ${method} ${BASE}${path}:`, e?.message);
    throw new Error(`Cannot reach the server. Pull down to retry or check your connection.`);
  }

  if (res.status === 401 && refreshToken && !path.startsWith('/auth')) {
    try {
      const r = await raw('POST', '/auth/refresh', { refreshToken });
      if (r.ok) {
        const s = await r.json();
        await saveSession(s.token, s.refreshToken);
        res = await raw(method, path, body);
      } else {
        await clearSession();
      }
    } catch {
      await clearSession();
    }
  }

  const text = await res.text().catch(() => '');
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    console.warn(`[API] Error ${res.status} from ${method} ${path}:`, json.error || text);
    throw new Error(json.error ?? (text && text.length < 120 ? text : 'Something went wrong'));
  }
  return json as T;
}

const cache = new Map<string, { data: any; exp: number }>();
const inFlight = new Map<string, Promise<any>>();

export function clearApiCache() {
  cache.clear();
  inFlight.clear();
}

export const api = {
  get: <T,>(p: string, force = false): Promise<T> => {
    const now = Date.now();
    const hit = cache.get(p);
    if (!force && hit && hit.exp > now) {
      return Promise.resolve(hit.data as T);
    }
    if (inFlight.has(p)) {
      return inFlight.get(p)!;
    }
    const prom = request<T>('GET', p).then((data) => {
      cache.set(p, { data, exp: Date.now() + 6000 });
      inFlight.delete(p);
      return data;
    }).catch((err) => {
      inFlight.delete(p);
      throw err;
    });
    inFlight.set(p, prom);
    return prom;
  },
  post: async <T,>(p: string, b?: unknown): Promise<T> => {
    clearApiCache();
    return request<T>('POST', p, b ?? {});
  },
  patch: async <T,>(p: string, b: unknown): Promise<T> => {
    clearApiCache();
    return request<T>('PATCH', p, b);
  },
  put: async <T,>(p: string, b: unknown): Promise<T> => {
    clearApiCache();
    return request<T>('PUT', p, b);
  },
};
