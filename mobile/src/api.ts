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

export function humanizeErrorMessage(rawError: any, status?: number, path?: string): string {
  if (!rawError) return 'An unexpected error occurred. Please try again.';

  let msg = typeof rawError === 'string' ? rawError : (rawError?.message || rawError?.error || '');
  if (typeof msg !== 'string') msg = JSON.stringify(msg);

  // Network & Connectivity issues
  if (/network request failed|failed to fetch|cannot reach|timeout|enotfound|econnrefused/i.test(msg)) {
    return 'Unable to connect to DuoSave servers. Please check your internet connection.';
  }

  // Authentication & Sign-in specific error handling
  const isAuthPath = path ? path.startsWith('/auth') : false;

  if (isAuthPath || /login|password|credentials/i.test(msg)) {
    if (/no account found|user not found|email not found/i.test(msg)) {
      return 'No account found with this email';
    }
    if (/incorrect password|wrong password/i.test(msg)) {
      return 'Incorrect password';
    }
    if (/invalid login credentials|email or password is wrong/i.test(msg)) {
      return 'Wrong email or password';
    }
    if (/email not confirmed/i.test(msg)) {
      return 'Email not confirmed';
    }
    if (/too many|rate limit/i.test(msg)) {
      return 'Too many attempts. Try later';
    }
    if (/invalid or expired verification code|token has expired|otp|invalid verification/i.test(msg)) {
      return 'Invalid verification code';
    }
    if (/password must be at least/i.test(msg)) {
      return 'Password must be at least 6 characters';
    }
    if (/passwords do not match/i.test(msg)) {
      return 'Passwords do not match';
    }
  }

  // Session expiration (for authenticated in-app calls only)
  if (!isAuthPath && (status === 401 || /jwt|unauthorized|invalid token|session expired/i.test(msg))) {
    return 'Your session has expired. Please sign in again to continue.';
  }
  if (status === 403 || /forbidden|permission|only the vault/i.test(msg)) {
    return typeof rawError === 'string' && rawError.length < 80 && !rawError.includes('Error:')
      ? rawError
      : 'You do not have permission to perform this action.';
  }

  // Specific database and business logic patterns
  if (/loans_status_check|violates check constraint/i.test(msg)) {
    return 'Loan approval feature requires database update. Please run the SQL migration in Supabase SQL editor.';
  }
  if (/exceeds currently available|not enough savings|insufficient/i.test(msg)) {
    return 'The requested loan exceeds the available savings currently in the vault.';
  }
  if (/already registered|user already exists|duplicate key/i.test(msg)) {
    return 'This email address is already associated with an existing account.';
  }
  if (/no vault found/i.test(msg)) {
    return 'No vault found with that invite code. Please double-check and try again.';
  }
  if (/already belong to a vault/i.test(msg)) {
    return 'You already belong to an active vault.';
  }
  if (/cannot delete a loan that has partial repayments/i.test(msg)) {
    return 'Cannot delete a loan that has already been partially repaid.';
  }

  // Hide raw JSON or code-like errors
  if (msg.startsWith('{') || msg.startsWith('[') || /code: '\d+'/i.test(msg) || /pgrst\d+/i.test(msg)) {
    return 'Something went wrong while processing your request. Please try again.';
  }

  // Server 500 fallback
  if (status && status >= 500) {
    return 'The server encountered a temporary hiccup. Please try again in a few moments.';
  }

  // Clean and capitalize
  const cleaned = msg.replace(/^Error:\s*/i, '').trim();
  if (!cleaned) return 'Something went wrong. Please try again.';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await raw(method, path, body);
  } catch (e: any) {
    console.warn(`[API] Failed: ${method} ${BASE}${path}:`, e?.message);
    throw new Error(humanizeErrorMessage(e?.message, undefined, path));
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
    const rawError = json.error ?? (text && text.length < 120 ? text : 'Something went wrong');
    throw new Error(humanizeErrorMessage(rawError, res.status, path));
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
  delete: async <T,>(p: string, b?: unknown): Promise<T> => {
    clearApiCache();
    return request<T>('DELETE', p, b);
  },
};
