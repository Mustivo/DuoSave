import { Router } from 'express';
import { z } from 'zod';
import { admin, anon } from '../supabase';
import { h, HttpError } from '../middleware/auth';

export const auth = Router();

const creds = z.object({ email: z.string().email(), password: z.string().min(6) });

async function fetchMe(userId: string) {
  const { data: profile } = await admin.from('profiles').select('id,name').eq('id', userId).single();
  const { data: m } = await admin.from('vault_members').select('vault_id').eq('user_id', userId).maybeSingle();
  if (!m?.vault_id) return { profile, vault: null, partner: null };
  const [{ data: v }, { data: ms }] = await Promise.all([
    admin.from('vaults').select('*').eq('id', m.vault_id).single(),
    admin.from('vault_members').select('user_id').eq('vault_id', m.vault_id),
  ]);
  const partnerId = (ms ?? []).map((x) => x.user_id).find((id) => id !== userId);
  const { data: partner } = partnerId
    ? await admin.from('profiles').select('id,name').eq('id', partnerId).single()
    : { data: null };
  return { profile, vault: v, partner };
}

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
  const me = await fetchMe(data.user.id);
  res.json({ token: s.session!.access_token, refreshToken: s.session!.refresh_token, me });
}));

auth.post('/login', h(async (req, res) => {
  const body = creds.parse(req.body);
  const { data, error } = await anon.auth.signInWithPassword(body);
  if (error || !data.session) throw new HttpError(401, 'Email or password is wrong');
  const me = await fetchMe(data.session.user.id);
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token, me });
}));

auth.post('/refresh', h(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new HttpError(401, 'Session expired. Sign in again');
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
}));

auth.post('/forgot-password', h(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const { error } = await anon.auth.resetPasswordForEmail(email.trim());
  if (error) throw new HttpError(400, error.message);
  res.json({ ok: true, message: 'Password reset link sent to your email.' });
}));
