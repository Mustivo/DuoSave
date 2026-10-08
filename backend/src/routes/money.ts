import { Router } from 'express';
import { z } from 'zod';
import { admin } from '../supabase';
import { h, HttpError, requireVault } from '../middleware/auth';
import { logAndAlertPartner } from '../services/notify';

export const money = Router();
money.use(requireVault);

const amount = z.number().positive().max(10_000_000).transform((n) => Math.round(n * 100) / 100);

async function nameOf(id: string) {
  const { data } = await admin.from('profiles').select('name').eq('id', id).single();
  return data?.name ?? 'Your partner';
}

/* ---------- Savings ---------- */
money.post('/savings', h(async (req, res) => {
  const b = z.object({ amount, note: z.string().max(80).optional() }).parse(req.body);
  const { data, error } = await admin.from('contributions')
    .insert({ vault_id: req.vaultId!, user_id: req.userId, amount: b.amount, note: b.note }).select().single();
  if (error) throw new HttpError(500, error.message);
  // Answering a reminder clears this person's pending reminders.
  await admin.from('notifications').update({ read: true })
    .eq('user_id', req.userId).eq('type', 'reminder').eq('read', false);
  await logAndAlertPartner(req.vaultId!, req.userId, 'deposit', `${await nameOf(req.userId)} saved ${b.amount}`, b.amount);
  res.json(data);
}));

money.get('/savings', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data } = await admin.from('contributions').select('*')
    .eq('vault_id', req.vaultId!).order('created_at', { ascending: false }).limit(500);
  res.json(data ?? []);
}));

/* ---------- Loans: taken automatically, the shared total drops right away ---------- */
money.post('/loans', h(async (req, res) => {
  const b = z.object({ amount, purpose: z.string().max(80).optional() }).parse(req.body);
  const { data, error } = await admin.rpc('take_loan', {
    p_vault: req.vaultId!, p_user: req.userId, p_amount: b.amount, p_purpose: b.purpose ?? null,
  });
  if (error) throw new HttpError(400, error.message);
  await logAndAlertPartner(req.vaultId!, req.userId, 'loan',
    `${await nameOf(req.userId)} took a loan of ${b.amount}${b.purpose ? ` for ${b.purpose}` : ''}`, b.amount);
  res.json(data);
}));

money.get('/loans', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data } = await admin.from('loans').select('*')
    .eq('vault_id', req.vaultId!).order('created_at', { ascending: false });
  res.json(data ?? []);
}));

money.post('/loans/:id/repay', h(async (req, res) => {
  const b = z.object({ amount }).parse(req.body);
  const { data, error } = await admin.rpc('repay_loan', {
    p_loan: req.params.id, p_user: req.userId, p_amount: b.amount,
  });
  if (error) throw new HttpError(400, error.message);
  await logAndAlertPartner(req.vaultId!, req.userId, 'repayment',
    `${await nameOf(req.userId)} repaid ${b.amount} of a loan`, b.amount);
  res.json(data);
}));

/* ---------- Feed + notifications ---------- */
money.get('/activity', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data } = await admin.from('activity').select('*')
    .eq('vault_id', req.vaultId!).order('created_at', { ascending: false }).limit(100);
  res.json(data ?? []);
}));

money.get('/notifications', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data } = await admin.from('notifications').select('*')
    .eq('user_id', req.userId).order('created_at', { ascending: false }).limit(50);
  res.json(data ?? []);
}));

money.post('/notifications/read', h(async (req, res) => {
  await admin.from('notifications').update({ read: true }).eq('user_id', req.userId).eq('read', false);
  res.json({ ok: true });
}));
