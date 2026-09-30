import { Router } from 'express';
import { z } from 'zod';
import { admin, anon } from '../supabase';
import { h, HttpError } from '../middleware/auth';

export const auth = Router();

const creds = z.object({ email: z.string().email(), password: z.string().min(6) });

auth.post('/register', h(async (req, res) => {
  const body = creds.extend({ name: z.string().min(1).max(40) }).parse(req.body);
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email, password: body.password, email_confirm: true,
  });
  if (error || !data.user) throw new HttpError(400, error?.message ?? 'Could not create account');
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, name: body.name });
  if (pErr) throw new HttpError(500, pErr.message);
  const { data: s, error: sErr } = await anon.auth.signInWithPassword({ email: body.email, password: body.password });
  if (sErr) throw new HttpError(400, sErr.message);
  res.json({ token: s.session!.access_token, refreshToken: s.session!.refresh_token });
}));

auth.post('/login', h(async (req, res) => {
  const body = creds.parse(req.body);
  const { data, error } = await anon.auth.signInWithPassword(body);
  if (error || !data.session) throw new HttpError(401, 'Email or password is wrong');
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
}));

auth.post('/refresh', h(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new HttpError(401, 'Session expired. Sign in again');
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
}));
