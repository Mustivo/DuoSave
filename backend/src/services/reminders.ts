import cron from 'node-cron';
import { admin } from '../supabase';
import { sendSaveReminder } from './notify';

/** Every day at 09:00 server time: remind vaults whose reminder_day is today. */
export function startReminders() {
  cron.schedule('0 9 * * *', async () => {
    const day = new Date().getDate();
    const { data } = await admin.from('vaults').select('id,currency,monthly_target').eq('reminder_day', day);
    for (const v of data ?? []) await sendSaveReminder(v.id, v.currency, Number(v.monthly_target));
  });
}
