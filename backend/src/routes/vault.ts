import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { admin } from '../supabase';
import { h, HttpError, requireVault } from '../middleware/auth';
import { logAndAlertPartner, sendSaveReminder } from '../services/notify';
import { sendPartnerCredentialsEmail } from '../services/mailer';

export const vault = Router();

const makeCode = () => {
  const s = randomBytes(5).toString('hex').toUpperCase();
  return `DUO-${s.slice(0, 4)}-${s.slice(4, 5)}`;
};

vault.get('/me', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data: profile } = await admin.from('profiles').select('id,name').eq('id', req.userId).single();
  let vId = req.vaultId;
  if (!vId) {
    const { data: defaultVault } = await admin.from('vaults').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (defaultVault) {
      await admin.from('vault_members').upsert({ vault_id: defaultVault.id, user_id: req.userId });
      vId = defaultVault.id;
    }
  }
  if (!vId) return res.json({ profile, vault: null, partner: null });
  const { data: v } = await admin.from('vaults').select('*').eq('id', vId).single();
  const { data: ms } = await admin.from('vault_members').select('user_id').eq('vault_id', vId);
  const partnerId = (ms ?? []).map((m) => m.user_id).find((id) => id !== req.userId);
  const { data: partner } = partnerId
    ? await admin.from('profiles').select('id,name').eq('id', partnerId).single()
    : { data: null };
  const isSteven = req.userEmail?.toLowerCase().includes('stevenmwizerwa') || req.userId === 'c0e5aa93-e6ab-4a6a-971e-bcfc8c4980b8' || (v && v.created_by === req.userId);
  res.json({ profile: { ...profile, email: req.userEmail }, vault: v, partner, isAdmin: !!isSteven });
}));

vault.post('/vault/partner', requireVault, h(async (req, res) => {
  const isSteven = req.userEmail?.toLowerCase().includes('stevenmwizerwa') || req.userId === 'c0e5aa93-e6ab-4a6a-971e-bcfc8c4980b8';
  const { data: v } = await admin.from('vaults').select('*').eq('id', req.vaultId!).single();
  if (!isSteven && v.created_by !== req.userId) {
    throw new HttpError(403, 'Only Steven (Admin) can create or manage the partner account');
  }

  const b = z.object({
    name: z.string().min(1).max(40),
    email: z.string().email(),
    password: z.string().min(6),
  }).parse(req.body);

  const { data: existingUsers } = await admin.auth.admin.listUsers();
  let partnerUser = (existingUsers.users ?? []).find((u) => u.email?.toLowerCase() === b.email.trim().toLowerCase());

  if (!partnerUser) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: b.email.trim(),
      password: b.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new HttpError(400, error?.message ?? 'Could not create partner account');
    partnerUser = created.user;
  } else {
    await admin.auth.admin.updateUserById(partnerUser.id, { password: b.password });
  }

  await admin.from('profiles').upsert({ id: partnerUser.id, name: b.name.trim() });

  const { data: members } = await admin.from('vault_members').select('user_id').eq('vault_id', req.vaultId!);
  for (const m of members ?? []) {
    if (m.user_id !== req.userId && m.user_id !== partnerUser.id) {
      await admin.from('vault_members').delete().eq('vault_id', req.vaultId!).eq('user_id', m.user_id);
    }
  }

  await admin.from('vault_members').upsert({ vault_id: req.vaultId!, user_id: partnerUser.id });
  await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${b.name} was linked as your partner`);

  const { data: adminProf } = await admin.from('profiles').select('name').eq('id', req.userId).maybeSingle();
  const adminName = adminProf?.name || 'Steven';
  await sendPartnerCredentialsEmail({
    to: b.email.trim(),
    name: b.name.trim(),
    password: b.password,
    adminName,
  });

  res.json({ ok: true, partner: { id: partnerUser.id, name: b.name, email: b.email } });
}));

vault.put('/me/push-token', h(async (req, res) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);
  await admin.from('profiles').update({ push_token: token }).eq('id', req.userId);
  res.json({ ok: true });
}));

vault.post('/vault', h(async (req, res) => {
  if (req.vaultId) throw new HttpError(400, 'You already belong to a vault');
  const b = z.object({
    name: z.string().min(1).max(40).default('Our Vault'),
    currency: z.string().length(3).default('USD'),
  }).parse(req.body);
  const { data: v, error } = await admin.from('vaults')
    .insert({ ...b, invite_code: makeCode(), created_by: req.userId }).select().single();
  if (error) throw new HttpError(500, error.message);
  await admin.from('vault_members').insert({ vault_id: v.id, user_id: req.userId });
  res.json(v);
}));

vault.post('/vault/join', h(async (req, res) => {
  if (req.vaultId) throw new HttpError(400, 'You already belong to a vault');
  const { code } = z.object({ code: z.string().min(4) }).parse(req.body);
  const { data: v } = await admin.from('vaults').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
  if (!v) throw new HttpError(404, 'No vault found with that code');
  const { count } = await admin.from('vault_members').select('*', { count: 'exact', head: true }).eq('vault_id', v.id);
  if ((count ?? 0) >= 2) throw new HttpError(400, 'This vault is limited to 2 partners and is already full');
  const { error } = await admin.from('vault_members').insert({ vault_id: v.id, user_id: req.userId });
  if (error) throw new HttpError(400, error.message);
  await logAndAlertPartner(v.id, req.userId, 'join', 'Your partner joined the vault');
  res.json(v);
}));

vault.patch('/vault', requireVault, h(async (req, res) => {
  const { data: currentVault } = await admin.from('vaults').select('created_by').eq('id', req.vaultId!).single();
  const isSteven = req.userEmail?.toLowerCase().includes('stevenmwizerwa') || req.userId === 'c0e5aa93-e6ab-4a6a-971e-bcfc8c4980b8';
  if (!isSteven && currentVault?.created_by !== req.userId) {
    throw new HttpError(403, 'Only the vault admin can edit the savings plan');
  }
  const b = z.object({
    name: z.string().min(1).max(40).optional(),
    savings_goal: z.number().min(0).optional(),
    monthly_target: z.number().min(0).optional(),
    reminder_day: z.number().int().min(1).max(28).optional(),
  }).parse(req.body);
  const { data, error } = await admin.from('vaults').update(b).eq('id', req.vaultId!).select().single();
  if (error) throw new HttpError(500, error.message);
  res.json(data);
}));

vault.get('/vault/summary', requireVault, h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const vid = req.vaultId!;
  const [{ data: bal }, { data: v }, { data: contribs }, { data: ms }, { data: loans }] = await Promise.all([
    admin.from('vault_balances').select('*').eq('vault_id', vid).single(),
    admin.from('vaults').select('*').eq('id', vid).single(),
    admin.from('contributions').select('user_id,amount,created_at').eq('vault_id', vid),
    admin.from('vault_members').select('user_id').eq('vault_id', vid),
    admin.from('loans').select('borrower_id,amount,repaid,status').eq('vault_id', vid),
  ]);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = await admin.from('profiles').select('id,name').in('id', ids);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const members = (profiles ?? []).map((p) => {
    const mine = (contribs ?? []).filter((c) => c.user_id === p.id);
    const owed = (loans ?? []).filter((l) => l.borrower_id === p.id && l.status === 'active')
      .reduce((s, l) => s + Number(l.amount) - Number(l.repaid), 0);
    return {
      id: p.id, name: p.name,
      total: mine.reduce((s, c) => s + Number(c.amount), 0),
      thisMonth: mine.filter((c) => new Date(c.created_at) >= monthStart).reduce((s, c) => s + Number(c.amount), 0),
      owed,
    };
  });
  res.json({
    vault: v,
    totalDeposited: Number(bal?.total_deposited ?? 0),
    loanedOut: Number(bal?.loaned_out ?? 0),
    available: Number(bal?.available ?? 0),
    members,
  });
}));

// Manual "remind us now" button.
vault.post('/vault/remind', requireVault, h(async (req, res) => {
  const { data: v } = await admin.from('vaults').select('currency,monthly_target').eq('id', req.vaultId!).single();
  await sendSaveReminder(req.vaultId!, v!.currency, Number(v!.monthly_target));
  res.json({ ok: true });
}));
