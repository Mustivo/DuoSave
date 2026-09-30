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
    const { data: m } = await admin.from('vault_members').select('vault_id').eq('user_id', req.userId).maybeSingle();
    req.vaultId = m?.vault_id;
    next();
  } catch (e) { next(e); }
}

export function requireVault(req: Request, _res: Response, next: NextFunction) {
  if (!req.vaultId) return next(new HttpError(400, 'Create or join a vault first'));
  next();
}
