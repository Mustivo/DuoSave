import { Router } from 'express';
import { z } from 'zod';
import { admin } from '../supabase';
import { h, HttpError, requireVault } from '../middleware/auth';
import { logAndAlertPartner } from '../services/notify';

export const money = Router();
money.use(requireVault);

const MASTER_ADMIN_EMAIL = 'stevenmwizerwa1@gmail.com';

const amount = z.number().positive().max(10_000_000).transform((n) => Math.round(n * 100) / 100);

/**
 * DuoSave Group Savings Loan Profit Charges:
 * - RWF 0 – 5,000: no profit charge (0)
 * - RWF 5,001 – 14,000: RWF 1,500 profit charge
 * - RWF 14,001 – 22,000: RWF 3,000 profit charge
 * - RWF 22,001 – 35,000: RWF 4,000 profit charge
 * - RWF 35,001 – 50,000: RWF 5,000 profit charge
 * - Above RWF 50,000: RWF 6,500 profit charge
 */
export function calculateProfitCharge(principal: number): number {
  if (principal <= 5000) return 0;
  if (principal <= 14000) return 1500;
  if (principal <= 22000) return 3000;
  if (principal <= 35000) return 4000;
  if (principal <= 50000) return 5000;
  return 6500;
}

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

/* ---------- Loans: request, approval, rejection, cancellation, and repayment ---------- */
money.post('/loans', h(async (req, res) => {
  const b = z.object({ amount, purpose: z.string().max(80).optional() }).parse(req.body);

  // Group Savings Rule Check: A member with an unpaid loan above RWF 50,000 may not take another loan unless emergency
  const { data: myActiveLoans } = await admin.from('loans').select('amount, repaid, status')
    .eq('vault_id', req.vaultId!).eq('borrower_id', req.userId).eq('status', 'active');

  const unpaidBalance = (myActiveLoans ?? []).reduce((s, l) => s + (Number(l.amount) - Number(l.repaid)), 0);
  const isEmergency = b.purpose?.toLowerCase().includes('emergency') || b.purpose?.toLowerCase().includes('urgent');
  if (unpaidBalance > 50000 && !isEmergency) {
    throw new HttpError(400, `Rule Limit: You have an existing unpaid loan balance of ${unpaidBalance} RWF. Members with unpaid loans above 50,000 RWF cannot request another loan unless it is a serious emergency.`);
  }

  // Check available vault balance before creating request
  const { data: bal } = await admin.from('vault_balances').select('available').eq('vault_id', req.vaultId!).single();
  const available = Number(bal?.available ?? 0);
  if (b.amount > available) {
    throw new HttpError(400, `The requested loan (${b.amount}) exceeds currently available vault savings (${available}).`);
  }

  // Calculate official rule profit charge
  const profitCharge = calculateProfitCharge(b.amount);
  const totalRepay = b.amount + profitCharge;
  const purposeText = b.purpose
    ? `${b.purpose} (Principal: ${b.amount}, Profit charge: ${profitCharge})`
    : `Principal: ${b.amount}, Profit charge: ${profitCharge}`;

  // Create loan with 'pending' status awaiting partner approval
  const { data, error } = await admin.from('loans').insert({
    vault_id: req.vaultId!,
    borrower_id: req.userId,
    amount: totalRepay,
    purpose: purposeText,
    status: 'pending',
  }).select().single();

  if (error) {
    if (error.code === '23514' || error.message.includes('check constraint')) {
      throw new HttpError(400, 'Loan approval feature requires database update. Please run the SQL migration in Supabase SQL editor.');
    }
    throw new HttpError(400, error.message);
  }

  const requesterName = await nameOf(req.userId);
  await logAndAlertPartner(
    req.vaultId!,
    req.userId,
    'loan',
    `Loan Request: ${requesterName} requested a loan of ${b.amount}${profitCharge > 0 ? ` (+${profitCharge} fee)` : ''}. Waiting for partner approval.`,
    b.amount,
  );

  res.json({
    ...data,
    principal: b.amount,
    profit_charge: profitCharge,
    requester_name: requesterName,
  });
}));

money.get('/loans', h(async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
  const { data: loans } = await admin.from('loans').select('*')
    .eq('vault_id', req.vaultId!).order('created_at', { ascending: false });

  const { data: profiles } = await admin.from('profiles').select('id, name');
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const enriched = (loans ?? []).map((l) => ({
    ...l,
    requester_name: profileMap.get(l.borrower_id) || 'Partner',
  }));

  res.json(enriched);
}));

money.post('/loans/:id/approve', h(async (req, res) => {
  const { data: loan } = await admin.from('loans').select('*').eq('id', req.params.id).eq('vault_id', req.vaultId!).maybeSingle();
  if (!loan) throw new HttpError(404, 'Loan request not found');

  if (loan.status !== 'pending') {
    throw new HttpError(400, `This loan is already ${loan.status}`);
  }

  if (loan.borrower_id === req.userId) {
    throw new HttpError(403, 'You cannot approve your own loan request. A partner must approve it.');
  }

  // Check vault balance
  const { data: bal } = await admin.from('vault_balances').select('available').eq('vault_id', req.vaultId!).single();
  const available = Number(bal?.available ?? 0);
  if (Number(loan.amount) > available) {
    throw new HttpError(400, `Insufficient vault savings to approve this loan. Available: ${available}`);
  }

  // Try RPC approve_loan first, fallback to direct update
  let updatedLoan = null;
  const { data: rpcData, error: rpcErr } = await admin.rpc('approve_loan', { p_loan: loan.id, p_user: req.userId });
  if (!rpcErr && rpcData) {
    updatedLoan = rpcData;
  } else {
    const { data: upd, error: updErr } = await admin.from('loans').update({ status: 'active' }).eq('id', loan.id).select().single();
    if (updErr) throw new HttpError(400, updErr.message);
    updatedLoan = upd;
  }

  const borrowerName = await nameOf(loan.borrower_id);
  const approverName = await nameOf(req.userId);

  await logAndAlertPartner(
    req.vaultId!,
    req.userId,
    'loan',
    `Loan Approved: ${borrowerName}'s loan of ${loan.amount} was approved by ${approverName}`,
    loan.amount,
  );

  // Directly notify the borrower
  await admin.from('notifications').insert({
    vault_id: req.vaultId!,
    user_id: loan.borrower_id,
    type: 'partner',
    title: 'Loan Approved! 🎉',
    body: `Your loan of ${loan.amount} was approved by ${approverName}. The funds are now active.`,
  });

  res.json({ ok: true, loan: updatedLoan });
}));

money.post('/loans/:id/reject', h(async (req, res) => {
  const { data: loan } = await admin.from('loans').select('*').eq('id', req.params.id).eq('vault_id', req.vaultId!).maybeSingle();
  if (!loan) throw new HttpError(404, 'Loan request not found');

  if (loan.status !== 'pending') {
    throw new HttpError(400, `This loan is already ${loan.status}`);
  }

  if (loan.borrower_id === req.userId) {
    throw new HttpError(403, 'Borrowers cannot reject their own loan. Use cancel instead.');
  }

  const { data: updated, error } = await admin.from('loans').update({ status: 'rejected' }).eq('id', loan.id).select().single();
  if (error) throw new HttpError(400, error.message);

  const borrowerName = await nameOf(loan.borrower_id);
  const rejecterName = await nameOf(req.userId);

  await logAndAlertPartner(
    req.vaultId!,
    req.userId,
    'loan',
    `Loan Request Declined: ${borrowerName}'s loan request of ${loan.amount} was declined by ${rejecterName}`,
    loan.amount,
  );

  await admin.from('notifications').insert({
    vault_id: req.vaultId!,
    user_id: loan.borrower_id,
    type: 'partner',
    title: 'Loan Request Declined',
    body: `Your loan request of ${loan.amount} was declined by ${rejecterName}.`,
  });

  res.json({ ok: true, loan: updated });
}));

money.post('/loans/:id/cancel', h(async (req, res) => {
  const { data: loan } = await admin.from('loans').select('*').eq('id', req.params.id).eq('vault_id', req.vaultId!).maybeSingle();
  if (!loan) throw new HttpError(404, 'Loan request not found');

  if (loan.borrower_id !== req.userId) {
    throw new HttpError(403, 'Only the borrower can cancel their pending loan request');
  }

  if (loan.status !== 'pending') {
    throw new HttpError(400, 'Only pending loan requests can be cancelled');
  }

  await admin.from('loans').delete().eq('id', loan.id);
  const requesterName = await nameOf(req.userId);

  await logAndAlertPartner(
    req.vaultId!,
    req.userId,
    'loan',
    `${requesterName} cancelled their loan request of ${loan.amount}`,
    loan.amount,
  );

  res.json({ ok: true, cancelled: true });
}));

money.post('/loans/:id/repay', h(async (req, res) => {
  const b = z.object({ amount }).parse(req.body);
  const { data: l } = await admin.from('loans').select('status').eq('id', req.params.id).maybeSingle();
  if (!l) throw new HttpError(404, 'Loan not found');
  if (l.status !== 'active') throw new HttpError(400, 'Only active loans can be repaid');

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

/* ---------- Deletions ---------- */
money.delete('/loans/:id', h(async (req, res) => {
  const { data: l } = await admin.from('loans').select('*').eq('id', req.params.id).eq('vault_id', req.vaultId!).maybeSingle();
  if (!l) throw new HttpError(404, 'Loan not found');
  const isMaster = req.userEmail?.toLowerCase() === MASTER_ADMIN_EMAIL;
  if (l.borrower_id !== req.userId && !isMaster) {
    throw new HttpError(403, `Only the borrower or master administrator (${MASTER_ADMIN_EMAIL}) can delete this loan`);
  }
  if (Number(l.repaid) > 0) {
    throw new HttpError(400, 'Cannot delete a loan that has partial repayments');
  }
  await admin.from('loans').delete().eq('id', req.params.id);
  await logAndAlertPartner(req.vaultId!, req.userId, 'loan', `Loan record of ${l.amount} was deleted`);
  res.json({ ok: true });
}));

money.delete('/savings/:id', h(async (req, res) => {
  const { data: c } = await admin.from('contributions').select('*').eq('id', req.params.id).eq('vault_id', req.vaultId!).maybeSingle();
  if (!c) throw new HttpError(404, 'Savings record not found');
  const isMaster = req.userEmail?.toLowerCase() === MASTER_ADMIN_EMAIL;
  if (c.user_id !== req.userId && !isMaster) {
    throw new HttpError(403, `Only contributor or master administrator (${MASTER_ADMIN_EMAIL}) can delete this deposit`);
  }
  await admin.from('contributions').delete().eq('id', req.params.id);
  await logAndAlertPartner(req.vaultId!, req.userId, 'deposit', `Savings deposit of ${c.amount} was deleted`);
  res.json({ ok: true });
}));
