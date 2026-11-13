import { Expo } from 'expo-server-sdk';
import { admin } from '../supabase';

const expo = new Expo();

export async function membersOf(vaultId: string): Promise<string[]> {
  const { data } = await admin.from('vault_members').select('user_id').eq('vault_id', vaultId);
  return (data ?? []).map((m) => m.user_id);
}

async function push(userIds: string[], title: string, body: string, data?: any) {
  try {
    const { data: profiles } = await admin.from('profiles').select('push_token').in('id', userIds);
    const messages = (profiles ?? [])
      .map((p) => p.push_token as string | null)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t))
      .map((to) => ({
        to,
        title,
        body,
        sound: 'default' as const,
        channelId: 'default',
        color: '#2ED07C',
        priority: 'high' as const,
        data: data || {},
        _displayInForeground: true,
      }));
    for (const chunk of expo.chunkPushNotifications(messages)) await expo.sendPushNotificationsAsync(chunk);
  } catch (e) { console.warn('push failed', e); }
}

/** Log to the shared activity feed and alert the partner. */
export async function logAndAlertPartner(
  vaultId: string, actorId: string, type: string, message: string, amount?: number, shouldPush = true,
) {
  await admin.from('activity').insert({ vault_id: vaultId, actor_id: actorId, type, message, amount });
  const partners = (await membersOf(vaultId)).filter((id) => id !== actorId);
  if (!partners.length) return;
  await admin.from('notifications').insert(
    partners.map((user_id) => ({ vault_id: vaultId, user_id, type: 'partner', title: 'DuoSave', body: message })),
  );
  if (shouldPush) {
    await push(partners, 'DuoSave', message);
  }
}

/** Send automatic savings reminder showing required monthly savings with 100% accurate dates. */
export async function sendSaveReminder(
  vaultId: string,
  currency: string,
  monthlyTarget: number,
  daysBefore?: number,
  reminderDay?: number,
) {
  const ids = await membersOf(vaultId);
  if (!ids.length) return;

  const count = ids.length;
  const targetPerPartner = Math.round(monthlyTarget / Math.max(1, count));
  const targetFormatted = monthlyTarget > 0 ? `${monthlyTarget.toLocaleString()} ${currency}` : `your monthly target`;
  const partnerRequiredFormatted = targetPerPartner > 0 ? `${targetPerPartner.toLocaleString()} ${currency}` : targetFormatted;
  const currentDay = new Date().getDate();
  const day = reminderDay ?? 28;

  let title: string;
  let body: string;
  let activityMsg: string;

  if (currentDay === day) {
    title = '🔔 Monthly Savings Day!';
    body = `Today is your scheduled monthly savings day (Day ${day})! You are required to contribute your monthly share of ${partnerRequiredFormatted} (Vault target: ${targetFormatted}).`;
    activityMsg = `Monthly savings day alert: You are required to save ${partnerRequiredFormatted} today (Day ${day})`;
  } else if (daysBefore === 3 || day - currentDay === 3) {
    title = `⏰ Savings Reminder (3 Days Remaining)`;
    body = `Upcoming savings deadline in 3 days (Day ${day})! You are required to contribute your monthly share of ${partnerRequiredFormatted} (Vault target: ${targetFormatted}).`;
    activityMsg = `3-Day notice: You are required to save ${partnerRequiredFormatted} due on day ${day}`;
  } else {
    const daysLeft = day > currentDay ? day - currentDay : (30 - currentDay + day);
    title = `⏰ Savings Reminder (Due Day ${day})`;
    body = `Your monthly savings deadline is on day ${day} (in ${daysLeft} days). You are required to contribute your monthly share of ${partnerRequiredFormatted} (Vault target: ${targetFormatted}).`;
    activityMsg = `Savings reminder: Required savings of ${partnerRequiredFormatted} due on day ${day} (in ${daysLeft} days)`;
  }

  await admin.from('notifications').insert(
    ids.map((user_id) => ({ vault_id: vaultId, user_id, type: 'reminder', title, body })),
  );

  await admin.from('activity').insert({
    vault_id: vaultId,
    type: 'reminder',
    message: activityMsg,
  });

  await push(ids, title, body);
}
