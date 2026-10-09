import { NextFunction, Request, RequestHandler, Response } from 'express';
import { admin } from '../supabase';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new HttpError(401, 'Please sign in');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, 'Session expired. Sign in again');
    req.userId = data.user.id;
    req.userEmail = data.user.email;
    const { data: m } = await admin.from('vault_members').select('vault_id').eq('user_id', req.userId).maybeSingle();
    req.vaultId = m?.vault_id;
    if (!req.vaultId) {
      const { data: defaultVault } = await admin.from('vaults').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (defaultVault) {
        await admin.from('vault_members').upsert({ vault_id: defaultVault.id, user_id: req.userId });
        req.vaultId = defaultVault.id;
      }
    }
    next();
  } catch (e) { next(e); }
}

export function requireVault(req: Request, _res: Response, next: NextFunction) {
  if (!req.vaultId) return next(new HttpError(400, 'Create or join a vault first'));
  next();
}
