import { Router } from 'express';
import { z } from 'zod';
import { admin, anon } from '../supabase';
import { h, HttpError } from '../middleware/auth';
import { sendPasswordResetOtpEmail } from '../services/mailer';
import { logAndAlertPartner } from '../services/notify';

export const auth = Router();

const creds = z.object({ email: z.string().email(), password: z.string().min(6) });
const MASTER_ADMIN_EMAIL = 'stevenmwizerwa1@gmail.com';

async function fetchMe(userId: string, email?: string) {
  const isSteven = email?.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
  const { data: profile } = await admin.from('profiles').select('id,name').eq('id', userId).single();
  const { data: m } = await admin.from('vault_members').select('vault_id').eq('user_id', userId).maybeSingle();
  const vId = m?.vault_id;
  if (!vId) return { profile: { ...profile, email }, vault: null, partner: null, isAdmin: isSteven };
  const [{ data: v }, { data: ms }] = await Promise.all([
    admin.from('vaults').select('*').eq('id', vId).single(),
    admin.from('vault_members').select('user_id').eq('vault_id', vId),
  ]);
  const partnerId = (ms ?? []).map((x) => x.user_id).find((id) => id !== userId);
  const { data: partner } = partnerId
    ? await admin.from('profiles').select('id,name').eq('id', partnerId).single()
    : { data: null };
  return { profile: { ...profile, email }, vault: v, partner, isAdmin: isSteven };
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
  const me = await fetchMe(data.user.id, body.email);
  res.json({ token: s.session!.access_token, refreshToken: s.session!.refresh_token, me });
}));

auth.post('/login', h(async (req, res) => {
  const body = creds.parse(req.body);
  const targetEmail = body.email.trim().toLowerCase();

  const { data, error } = await anon.auth.signInWithPassword({
    email: targetEmail,
    password: body.password,
  });

  if (error || !data.session) {
    if (error?.message?.includes('Email not confirmed')) {
      throw new HttpError(401, 'Email not confirmed');
    }
    if (error?.message?.includes('rate limit') || error?.message?.includes('Too many')) {
      throw new HttpError(429, 'Too many attempts. Try later');
    }

    // Check if account exists with this email
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: targetEmail,
      });

      if (linkErr || !linkData?.user) {
        throw new HttpError(401, 'No account found with this email');
      }
    } catch (checkErr: any) {
      if (checkErr instanceof HttpError) throw checkErr;
    }

    throw new HttpError(401, 'Incorrect password');
  }

  const me = await fetchMe(data.session.user.id, data.session.user.email);

  // Record partner login in activity feed without sending an intrusive push notification
  if (me.vault && me.partner) {
    const actorName = me.profile.name || data.session.user.email || 'Partner';
    logAndAlertPartner(
      me.vault.id,
      data.session.user.id,
      'join',
      `${actorName} logged in to DuoSave`,
      undefined,
      false // shouldPush = false
    ).catch(() => {});
  }

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
  const targetEmail = email.trim().toLowerCase();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: targetEmail,
  });

  if (error || !data.properties?.email_otp) {
    throw new HttpError(400, error?.message ?? 'No account found with this email');
  }

  const otp = data.properties.email_otp;
  if (data.user?.id) {
    await admin.auth.admin.updateUserById(data.user.id, {
      user_metadata: { ...data.user.user_metadata, setup_otp: otp },
    }).catch(() => {});
  }
  await sendPasswordResetOtpEmail({ to: targetEmail, otp });

  res.json({ ok: true, message: 'Verification code sent to your email.' });
}));

auth.post('/verify-code', h(async (req, res) => {
  const b = z.object({
    email: z.string().email().optional(),
    otp: z.string().min(4).max(12),
  }).parse(req.body);

  const cleanOtp = b.otp.trim();
  let verifiedUserId: string | null = null;
  let targetEmail = b.email?.trim().toLowerCase();

  // 1. If email is provided, verify directly with Supabase
  if (targetEmail) {
    const { data: vData, error: vError } = await anon.auth.verifyOtp({
      email: targetEmail,
      token: cleanOtp,
      type: 'recovery',
    });
    if (!vError && vData?.user) {
      verifiedUserId = vData.user.id;
    }
  }

  // 2. If no email is provided, match against users with active OTP
  if (!verifiedUserId) {
    const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (!listErr && usersData?.users) {
      // Sort candidates by most recent recovery_sent_at / updated_at
      const candidates = [...usersData.users].sort((a, b) => {
        const timeA = a.recovery_sent_at ? new Date(a.recovery_sent_at).getTime() : 0;
        const timeB = b.recovery_sent_at ? new Date(b.recovery_sent_at).getTime() : 0;
        return timeB - timeA;
      });

      for (const u of candidates) {
        if (!u.email) continue;

        // Check stored setup_otp
        if (u.user_metadata?.setup_otp === cleanOtp) {
          verifiedUserId = u.id;
          targetEmail = u.email;
          break;
        }

        // Test recovery OTP verification
        if (u.recovery_sent_at) {
          const { data: vData, error: vError } = await anon.auth.verifyOtp({
            email: u.email,
            token: cleanOtp,
            type: 'recovery',
          });
          if (!vError && vData?.user) {
            verifiedUserId = vData.user.id;
            targetEmail = u.email;
            break;
          }
        }
      }
    }
  }

  if (!verifiedUserId) {
    throw new HttpError(400, 'Invalid verification code');
  }

  res.json({ ok: true, userId: verifiedUserId, email: targetEmail, message: 'Code verified successfully' });
}));

auth.post('/set-password', h(async (req, res) => {
  const b = z.object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    otp: z.string().optional(),
    newPassword: z.string().min(6),
  }).parse(req.body);

  let targetUserId = b.userId;

  if (!targetUserId && b.email && b.otp) {
    const targetEmail = b.email.trim().toLowerCase();
    const { data: vData, error: vError } = await anon.auth.verifyOtp({
      email: targetEmail,
      token: b.otp.trim(),
      type: 'recovery',
    });
    if (vError || !vData.user) {
      throw new HttpError(400, 'Invalid verification code');
    }
    targetUserId = vData.user.id;
  }

  if (!targetUserId) {
    throw new HttpError(400, 'Missing user verification information');
  }

  const { error: uErr } = await admin.auth.admin.updateUserById(targetUserId, {
    password: b.newPassword,
    user_metadata: { setup_otp: null },
  });

  if (uErr) throw new HttpError(400, uErr.message);

  res.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
}));

auth.post('/reset-password', h(async (req, res) => {
  const b = z.object({
    email: z.string().email(),
    otp: z.string().min(4).max(12),
    newPassword: z.string().min(6),
  }).parse(req.body);

  const targetEmail = b.email.trim().toLowerCase();

  const { data: vData, error: vError } = await anon.auth.verifyOtp({
    email: targetEmail,
    token: b.otp.trim(),
    type: 'recovery',
  });

  if (vError || !vData.user) {
    throw new HttpError(400, vError?.message ?? 'Invalid or expired verification code');
  }

  const { error: uErr } = await admin.auth.admin.updateUserById(vData.user.id, {
    password: b.newPassword,
  });

  if (uErr) throw new HttpError(400, uErr.message);

  res.json({ ok: true, message: 'Password has been updated. You can now log in.' });
}));
