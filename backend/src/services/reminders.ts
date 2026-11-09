import cron from 'node-cron';
import { admin } from '../supabase';
import { sendSaveReminder } from './notify';

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
  return data?.length ?? 0;
}

/** Every day at 09:00 server time: remind vaults whose reminder_day is today. */
export function startReminders() {
  cron.schedule('0 9 * * *', async () => {
    await checkAndSendReminders();
  });
}
