import cron from 'node-cron';
import { admin } from '../supabase';
import { membersOf, sendSaveReminder } from './notify';

/** Check vaults and automatically apply late savings charges to partners who missed the deadline. */
export async function checkAndApplyLateCharges() {
  const today = new Date();
  const currentDay = today.getDate();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const { data: vaults } = await admin
    .from('vaults')
    .select('id,currency,monthly_target,reminder_day');

  for (const v of vaults ?? []) {
    const day = Number(v.reminder_day ?? 28);
    // User Requirement: When the days that admin set expires, automatically add the charge and send notification
    if (currentDay > day) {
      const memberIds = await membersOf(v.id);
      if (!memberIds.length) continue;

      const monthlyTarget = Number(v.monthly_target ?? 6000);
      const requiredPerPartner = Math.round(monthlyTarget / Math.max(1, memberIds.length));

      // Fetch contributions for this month
      const { data: contribs } = await admin
        .from('contributions')
        .select('user_id,amount,note,created_at')
        .eq('vault_id', v.id)
        .gte('created_at', monthStart);

      // Fetch existing late fee loans for this month to avoid duplicates
      const { data: existingLateLoans } = await admin
        .from('loans')
        .select('borrower_id,purpose,created_at')
        .eq('vault_id', v.id)
        .ilike('purpose', '%Late savings fee%')
        .gte('created_at', monthStart);

      const alreadyChargedUsers = new Set((existingLateLoans ?? []).map((l) => l.borrower_id));

      for (const userId of memberIds) {
        if (alreadyChargedUsers.has(userId)) continue;

        // Check total saved by this member this month (excluding general account savings)
        const myMonthSavings = (contribs ?? [])
          .filter((c) => c.user_id === userId && c.note !== 'Account savings')
          .reduce((sum, c) => sum + Number(c.amount), 0);

        if (myMonthSavings < requiredPerPartner) {
          // Member has not met their monthly required savings: apply 1,500 RWF official late rule charge
          const lateFee = 1500;
          await admin.from('loans').insert({
            vault_id: v.id,
            borrower_id: userId,
            amount: lateFee,
            repaid: 0,
            purpose: `Late savings fee (Overdue contribution of ${requiredPerPartner.toLocaleString()} ${v.currency} for Day ${day})`,
            status: 'active',
          });

          const title = '⚠️ Late Savings Charge Applied (1,500 RWF)';
          const body = `Your monthly savings deadline on day ${day} has passed without your required contribution of ${requiredPerPartner.toLocaleString()} ${v.currency} (so far ${myMonthSavings.toLocaleString()} ${v.currency} saved). An official late charge of ${lateFee.toLocaleString()} ${v.currency} has been added to your account.`;

          await admin.from('notifications').insert({
            vault_id: v.id,
            user_id: userId,
            type: 'reminder',
            title,
            body,
          });

          const { data: prof } = await admin.from('profiles').select('name').eq('id', userId).single();
          const memberName = prof?.name ?? 'Partner';
          await admin.from('activity').insert({
            vault_id: v.id,
            actor_id: userId,
            type: 'loan',
            message: `Late fee of ${lateFee} ${v.currency} applied to ${memberName} (Missed Day ${day} monthly deadline)`,
            amount: lateFee,
          });
        }
      }
    }
  }
}

export async function checkAndSendReminders() {
  const today = new Date();
  const currentDay = today.getDate();

  // Target day for the 3-day advance notice
  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const targetAdvanceDay = in3Days.getDate();

  // Find all vaults whose reminder_day matches either the 3-day notice OR today
  const { data } = await admin
    .from('vaults')
    .select('id,currency,monthly_target,reminder_day')
    .or(`reminder_day.eq.${targetAdvanceDay},reminder_day.eq.${currentDay}`);

  for (const v of data ?? []) {
    const is3DaysBefore = Number(v.reminder_day) === targetAdvanceDay;
    const daysRemaining = is3DaysBefore ? 3 : 0;
    await sendSaveReminder(
      v.id,
      v.currency,
      Number(v.monthly_target),
      daysRemaining,
      Number(v.reminder_day)
    );
  }

  // Also check and apply late charges for expired deadlines
  await checkAndApplyLateCharges().catch((e) => console.warn('Late charges check failed:', e));

  return data?.length ?? 0;
}

/** Every day at 09:00 server time: remind vaults whose reminder_day is today and check expired deadlines. */
export function startReminders() {
  cron.schedule('0 9 * * *', async () => {
    await checkAndSendReminders();
  });
}
