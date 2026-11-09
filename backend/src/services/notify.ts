import { Expo } from 'expo-server-sdk';
import { admin } from '../supabase';

const expo = new Expo();

export async function membersOf(vaultId: string): Promise<string[]> {
  const { data } = await admin.from('vault_members').select('user_id').eq('vault_id', vaultId);
  return (data ?? []).map((m) => m.user_id);
}

async function push(userIds: string[], title: string, body: string) {
  try {
    const { data } = await admin.from('profiles').select('push_token').in('id', userIds);
    const messages = (data ?? [])
      .map((p) => p.push_token as string | null)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t))
      .map((to) => ({ to, title, body, sound: 'default' as const }));
    for (const chunk of expo.chunkPushNotifications(messages)) await expo.sendPushNotificationsAsync(chunk);
  } catch (e) { console.warn('push failed', e); }
}

/** Log to the shared activity feed and alert the partner. */
export async function logAndAlertPartner(
  vaultId: string, actorId: string, type: string, message: string, amount?: number,
) {
  await admin.from('activity').insert({ vault_id: vaultId, actor_id: actorId, type, message, amount });
  const partners = (await membersOf(vaultId)).filter((id) => id !== actorId);
  if (!partners.length) return;
  await admin.from('notifications').insert(
    partners.map((user_id) => ({ vault_id: vaultId, user_id, type: 'partner', title: 'DuoSave', body: message })),
  );
  await push(partners, 'DuoSave', message);
}

/** Send automatic savings reminder showing required monthly savings. */
export async function sendSaveReminder(
  vaultId: string,
  currency: string,
  monthlyTarget: number,
  daysBefore = 0,
  reminderDay?: number,
) {
  const ids = await membersOf(vaultId);
  if (!ids.length) return;

  const targetFormatted = monthlyTarget > 0 ? `${monthlyTarget.toLocaleString()} ${currency}` : `your monthly target`;

  const title = daysBefore > 0
    ? `Savings Reminder (3 Days Remaining)`
    : `Monthly Savings Day!`;

  const body = daysBefore > 0
    ? `Upcoming deadline in 3 days: You and your partner are required to save ${targetFormatted} this month before day ${reminderDay ?? ''}. Please deposit your contribution!`
    : `Today is your scheduled savings day! Both partners are required to save towards the ${targetFormatted} monthly target.`;

  await admin.from('notifications').insert(
    ids.map((user_id) => ({ vault_id: vaultId, user_id, type: 'reminder', title, body })),
  );

  await admin.from('activity').insert({
    vault_id: vaultId,
    type: 'reminder',
    message: daysBefore > 0
      ? `3-Day notice: Required monthly savings of ${targetFormatted} due on day ${reminderDay ?? ''}`
      : `Monthly savings reminder: Required ${targetFormatted} target due today`,
  });

  await push(ids, title, body);
}
