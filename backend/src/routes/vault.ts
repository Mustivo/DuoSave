import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { admin } from '../supabase';
import { h, HttpError, requireVault } from '../middleware/auth';
import { logAndAlertPartner, sendSaveReminder } from '../services/notify';
import { sendPartnerSetupOtpEmail } from '../services/mailer';

export const vault = Router();

export const MASTER_ADMIN_EMAIL = 'stevenmwizerwa1@gmail.com';

export function isMasterAdmin(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

const makeCode = () => {
  const s = randomBytes(5).toString('hex').toUpperCase();
  return `DUO-${s.slice(0, 4)}-${s.slice(4, 5)}`;
};

vault.get('/me', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data: profile } = await admin.from('profiles').select('id,name').eq('id', req.userId).single();
  const isAdmin = isMasterAdmin(req.userEmail);
  let vId = req.vaultId;
  if (!vId) return res.json({ profile, vault: null, partner: null, partners: [], isAdmin });
  const { data: v } = await admin.from('vaults').select('*').eq('id', vId).single();
  const { data: ms } = await admin.from('vault_members').select('user_id, joined_at').eq('vault_id', vId);
  const partnerIds = (ms ?? []).map((m) => m.user_id).filter((id) => id !== req.userId);
  const { data: partnerProfiles } = partnerIds.length
    ? await admin.from('profiles').select('id,name').in('id', partnerIds)
    : { data: [] };

  const partners = await Promise.all((partnerProfiles ?? []).map(async (p) => {
    let email: string | undefined;
    try {
      const u = await admin.auth.admin.getUserById(p.id);
      email = u.data.user?.email;
    } catch {}
    return {
      id: p.id,
      name: p.name,
      email,
      joined_at: (ms ?? []).find((m) => m.user_id === p.id)?.joined_at,
    };
  }));

  const partner = partners.length > 0 ? partners[0] : null;
  res.json({
    profile: { ...profile, email: req.userEmail },
    vault: v,
    partner,
    partners,
    membersCount: (ms ?? []).length,
    isAdmin,
  });
}));

vault.post('/vault/partner', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can create or manage partner accounts`);
  }

  const b = z.object({
    name: z.string().min(1).max(40),
    email: z.string().email(),
  }).parse(req.body);

  const email = b.email.trim().toLowerCase();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
  });
  if (error || !created.user) {
    throw new HttpError(400, 'This email is already registered. You can link them directly from the System Directory below.');
  }
  const partnerUser = created.user;

  await admin.from('profiles').upsert({ id: partnerUser.id, name: b.name.trim() });

  // Add new member to vault without deleting existing members
  await admin.from('vault_members').upsert({ vault_id: req.vaultId!, user_id: partnerUser.id });
  await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${b.name} was linked as a new vault partner`);

  const { data: adminProf } = await admin.from('profiles').select('name').eq('id', req.userId).maybeSingle();
  const adminName = adminProf?.name || 'Administrator';
  const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (recoveryError || !recovery.properties?.email_otp) {
    throw new HttpError(500, 'Could not prepare the partner setup email');
  }
  await sendPartnerSetupOtpEmail({
    to: email,
    name: b.name.trim(),
    otp: recovery.properties.email_otp,
    adminName,
  });

  res.json({ ok: true, partner: { id: partnerUser.id, name: b.name, email: b.email } });
}));

vault.delete('/vault/partner', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can delete or unlink partners`);
  }

  const targetUserId = (req.query.userId as string) || (req.body?.userId as string);
  const permanent = req.query.permanent === 'true' || req.body?.permanent === true;

  if (targetUserId) {
    if (targetUserId === req.userId) {
      throw new HttpError(400, 'Cannot remove yourself as admin. Delete or transfer the vault instead.');
    }
    const { data: pProfile } = await admin.from('profiles').select('name').eq('id', targetUserId).maybeSingle();
    const partnerName = pProfile?.name || 'Partner';
    await admin.from('vault_members').delete().eq('vault_id', req.vaultId!).eq('user_id', targetUserId);
    
    if (permanent) {
      await admin.from('notifications').delete().eq('user_id', targetUserId);
      await admin.from('profiles').delete().eq('id', targetUserId);
      try {
        await admin.auth.admin.deleteUser(targetUserId);
      } catch (e: any) {
        console.warn('deleteUser error:', e?.message);
      }
    }

    await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${partnerName} was removed from the vault`);
    return res.json({ ok: true, message: `${partnerName} was removed from the vault` });
  }

  // Fallback: unlink all other members
  const { data: members } = await admin.from('vault_members').select('user_id').eq('vault_id', req.vaultId!);
  for (const m of members ?? []) {
    if (m.user_id !== req.userId) {
      await admin.from('vault_members').delete().eq('vault_id', req.vaultId!).eq('user_id', m.user_id);
    }
  }
  await logAndAlertPartner(req.vaultId!, req.userId, 'join', 'Partners were unlinked from the vault');
  res.json({ ok: true });
}));

vault.delete('/vault/partner/:userId', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can delete partners`);
  }
  const targetUserId = req.params.userId;
  const permanent = req.query.permanent === 'true';

  if (targetUserId === req.userId) {
    throw new HttpError(400, 'Cannot remove yourself as admin. Delete or transfer the vault instead.');
  }
  const { data: pProfile } = await admin.from('profiles').select('name').eq('id', targetUserId).maybeSingle();
  const partnerName = pProfile?.name || 'Partner';
  await admin.from('vault_members').delete().eq('vault_id', req.vaultId!).eq('user_id', targetUserId);

  if (permanent) {
    await admin.from('notifications').delete().eq('user_id', targetUserId);
    await admin.from('profiles').delete().eq('id', targetUserId);
    try {
      await admin.auth.admin.deleteUser(targetUserId);
    } catch (e: any) {
      console.warn('deleteUser error:', e?.message);
    }
  }

  await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${partnerName} was removed from the vault`);
  res.json({ ok: true, message: `${partnerName} was removed from the vault` });
}));

vault.delete('/vault/admin/user/:userId', h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can permanently delete user accounts`);
  }
  const targetUserId = req.params.userId;
  if (targetUserId === req.userId) {
    throw new HttpError(400, 'Cannot delete yourself as master administrator.');
  }
  await admin.from('vault_members').delete().eq('user_id', targetUserId);
  await admin.from('notifications').delete().eq('user_id', targetUserId);
  await admin.from('profiles').delete().eq('id', targetUserId);
  try {
    await admin.auth.admin.deleteUser(targetUserId);
  } catch (err: any) {
    console.warn('deleteUser auth error:', err?.message);
  }
  res.json({ ok: true, message: 'User account permanently deleted' });
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
    currency: z.string().length(3).default('RWF'),
  }).parse(req.body);
  const { data: v, error } = await admin.from('vaults')
    .insert({ ...b, monthly_target: 6000, invite_code: makeCode(), created_by: req.userId }).select().single();
  if (error) throw new HttpError(500, error.message);
  await admin.from('vault_members').insert({ vault_id: v.id, user_id: req.userId });
  res.json(v);
}));

vault.post('/vault/join', h(async (req, res) => {
  if (req.vaultId) throw new HttpError(400, 'You already belong to a vault');
  const { code } = z.object({ code: z.string().min(4) }).parse(req.body);
  const { data: v } = await admin.from('vaults').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
  if (!v) throw new HttpError(404, 'No vault found with that invite code');
  const { error } = await admin.from('vault_members').insert({ vault_id: v.id, user_id: req.userId });
  if (error) throw new HttpError(400, error.message);
  const { data: p } = await admin.from('profiles').select('name').eq('id', req.userId).maybeSingle();
  const userName = p?.name || 'A new partner';
  await logAndAlertPartner(v.id, req.userId, 'join', `${userName} joined the vault`);
  res.json(v);
}));

vault.patch('/vault', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can edit the savings plan`);
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

/* ---------- Master Admin System Directory & Partner Linking Portal ---------- */
vault.get('/vault/admin/directory', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can access system directory`);
  }

  // 1. Fetch all registered auth users
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) throw new HttpError(500, usersErr.message);

  // 2. Fetch profiles
  const { data: profiles } = await admin.from('profiles').select('id, name, created_at');
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // 3. Fetch all vault memberships & vaults
  const [{ data: memberships }, { data: vaultsList }] = await Promise.all([
    admin.from('vault_members').select('vault_id, user_id, joined_at'),
    admin.from('vaults').select('id, name'),
  ]);

  const vaultMap = new Map((vaultsList ?? []).map((v) => [v.id, v.name]));
  const userVaultMap = new Map((memberships ?? []).map((m) => [m.user_id, m.vault_id]));

  const currentVaultId = req.vaultId!;

  const directory = (usersData.users ?? [])
    .filter((u) => u.email?.toLowerCase() !== MASTER_ADMIN_EMAIL)
    .map((u) => {
      const p = profileMap.get(u.id);
      const vId = userVaultMap.get(u.id);
      const isLinkedToMyVault = vId === currentVaultId;
      return {
        id: u.id,
        email: u.email ?? '',
        name: p?.name || u.email?.split('@')[0] || 'User',
        created_at: u.created_at,
        isLinkedToMyVault,
        isLinkedToAnyVault: !!vId,
        currentVaultId: vId ?? null,
        currentVaultName: vId ? (vaultMap.get(vId) || 'Active Vault') : null,
      };
    });

  res.json({ ok: true, users: directory, total: directory.length });
}));

vault.post('/vault/admin/link', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can link partners`);
  }

  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  if (userId === req.userId) {
    throw new HttpError(400, 'Cannot link yourself as a partner');
  }

  const { data: userResp } = await admin.auth.admin.getUserById(userId);
  if (!userResp?.user) throw new HttpError(404, 'User not found in system');

  // Insert or update member in admin's vault
  const { error } = await admin.from('vault_members').upsert({
    vault_id: req.vaultId!,
    user_id: userId,
  });
  if (error) throw new HttpError(400, error.message);

  const { data: p } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
  const partnerName = p?.name || userResp.user.email || 'Partner';

  await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${partnerName} was linked to the vault by master admin`);

  res.json({ ok: true, message: `${partnerName} was successfully linked to your vault` });
}));

vault.post('/vault/admin/unlink', requireVault, h(async (req, res) => {
  if (!isMasterAdmin(req.userEmail)) {
    throw new HttpError(403, `Only master administrator (${MASTER_ADMIN_EMAIL}) can unlink partners`);
  }

  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  if (userId === req.userId) {
    throw new HttpError(400, 'Cannot unlink yourself as admin');
  }

  const { data: p } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
  const partnerName = p?.name || 'Partner';

  await admin.from('vault_members').delete().eq('vault_id', req.vaultId!).eq('user_id', userId);
  await logAndAlertPartner(req.vaultId!, req.userId, 'join', `${partnerName} was unlinked from the vault`);

  res.json({ ok: true, message: `${partnerName} was unlinked from your vault` });
}));

vault.get('/vault/summary', requireVault, h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const vid = req.vaultId!;
  const [{ data: bal }, { data: v }, { data: contribs }, { data: ms }, { data: loans }] = await Promise.all([
    admin.from('vault_balances').select('*').eq('vault_id', vid).single(),
    admin.from('vaults').select('*').eq('id', vid).single(),
    admin.from('contributions').select('user_id,amount,note,created_at').eq('vault_id', vid),
    admin.from('vault_members').select('user_id').eq('vault_id', vid),
    admin.from('loans').select('borrower_id,amount,repaid,status').eq('vault_id', vid),
  ]);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = await admin.from('profiles').select('id,name').in('id', ids);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const accountSavings = (contribs ?? [])
    .filter((c) => c.note === 'Account savings')
    .reduce((s, c) => s + Number(c.amount), 0);

  const members = (profiles ?? []).map((p) => {
    // Only personal contributions are assigned to individual members
    const mine = (contribs ?? []).filter((c) => c.user_id === p.id && c.note !== 'Account savings');
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
    accountSavings,
    members,
  });
}));

// Manual "remind us now" button.
vault.post('/vault/remind', requireVault, h(async (req, res) => {
  const { data: v } = await admin.from('vaults').select('currency,monthly_target').eq('id', req.vaultId!).single();
  await sendSaveReminder(req.vaultId!, v!.currency, Number(v!.monthly_target));
  res.json({ ok: true });
}));
