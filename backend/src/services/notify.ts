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

/** Ask both people to save. They answer by typing the amount in the app. */
export async function sendSaveReminder(vaultId: string, currency: string, monthlyTarget: number) {
  const ids = await membersOf(vaultId);
  if (!ids.length) return;
  const body = monthlyTarget > 0
    ? `Time to save. Your shared target is ${monthlyTarget} ${currency} this month. Enter what you saved.`
    : 'Time to save. Enter how much you are adding this month.';
  await admin.from('notifications').insert(
    ids.map((user_id) => ({ vault_id: vaultId, user_id, type: 'reminder', title: 'Savings time', body })),
  );
  await admin.from('activity').insert({ vault_id: vaultId, type: 'reminder', message: 'Monthly savings reminder sent to both partners' });
  await push(ids, 'Savings time', body);
}
