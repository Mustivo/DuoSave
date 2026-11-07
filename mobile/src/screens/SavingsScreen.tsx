import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Notif, Summary } from '../types';
import { Button, Card, ErrorText, Input, ProgressBar, Screen, T, money, useLoad } from '../ui';

export default function SavingsScreen() {
  const { c } = useTheme();
  const { me, refreshMe } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, notifs] = await Promise.all([
      api.get<Summary>('/vault/summary'),
      api.get<Notif[]>('/notifications'),
    ]);
    return {
      summary,
      reminder: notifs.find((n) => n.type === 'reminder' && !n.read) ?? null,
      allNotifs: notifs.filter((n) => !n.read),
    };
  });

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Quick edit reminder day modal/input state for admin
  const [showEditDay, setShowEditDay] = useState(false);
  const [newDay, setNewDay] = useState('');
  const [savingDay, setSavingDay] = useState(false);
  const [dismissedLocalReminder, setDismissedLocalReminder] = useState(false);

  const isVaultOwner = Boolean(me?.vault?.created_by && me?.profile?.id && me.vault.created_by === me.profile.id);

  const save = async () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!(n > 0)) { setErr('Enter an amount greater than 0'); return; }
    setBusy(true); setErr(null);
    try {
      await api.post('/savings', { amount: n, note: note || undefined });
      setAmount(''); setNote('');
      await reload();
      Alert.alert('Savings Added', `Successfully saved ${money(n, cur)}!`);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const handleUpdateReminderDay = async (selectedDay: number) => {
    if (!isVaultOwner) return;
    setSavingDay(true);
    try {
      await api.patch('/vault', { reminder_day: selectedDay });
      await Promise.all([reload(), refreshMe()]);
      setShowEditDay(false);
      Alert.alert('Reminder Day Set', `Both partners will be notified on day ${selectedDay} of every month.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingDay(false);
    }
  };

  const handleSendReminderNow = async () => {
    try {
      await api.post('/vault/remind');
      await reload();
      Alert.alert('Reminder Sent', 'Both partners have been reminded on their dashboard!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDismissReminder = async () => {
    setDismissedLocalReminder(true);
    try {
      await api.post('/notifications/read');
      await reload();
    } catch {}
  };

  const s = data?.summary;
  const cur = s?.vault.currency ?? 'RWF';
  const colors = [c.accent, c.blue];
  const monthTotal = s?.members.reduce((t, m) => t + m.thisMonth, 0) ?? 0;
  const reminderDay = s?.vault.reminder_day ?? 1;

  // Calculate day-of-month logic
  const today = new Date();
  const currentDay = today.getDate();
  const isTodayReminderDay = currentDay === reminderDay;
  const daysUntilReminder = reminderDay >= currentDay ? reminderDay - currentDay : (30 - currentDay + reminderDay);
  const isApproaching = daysUntilReminder > 0 && daysUntilReminder <= 3;
  const isPastDue = currentDay > reminderDay && monthTotal < (s?.vault.monthly_target ?? 0);

  return (
    <Screen title="Savings" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Dynamic Notification Banner displayed for BOTH users based on reminder_day */}
      {!dismissedLocalReminder && (data?.reminder || isTodayReminderDay || isApproaching || isPastDue) && (
        <Card style={{
          borderColor: isTodayReminderDay ? c.accent : isPastDue ? c.warn : c.blue,
          borderWidth: 1.5,
          backgroundColor: isTodayReminderDay ? c.accent + '12' : isPastDue ? c.warn + '12' : c.blue + '12',
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons
                name={isTodayReminderDay ? 'notifications' : isPastDue ? 'alert-circle' : 'time-outline'}
                size={22}
                color={isTodayReminderDay ? c.accent : isPastDue ? c.warn : c.blue}
              />
              <T weight="700" color={isTodayReminderDay ? c.accent : isPastDue ? c.warn : c.blue} size={15}>
                {isTodayReminderDay
                  ? `🔔 Monthly Savings Day! (Day ${reminderDay})`
                  : isApproaching
                  ? `⏰ Savings Day in ${daysUntilReminder} day${daysUntilReminder > 1 ? 's' : ''}`
                  : isPastDue
                  ? `⚠️ Savings Reminder (Due Day ${reminderDay})`
                  : (data?.reminder?.title ?? 'Savings Reminder')}
              </T>
            </View>
            <Pressable onPress={handleDismissReminder} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="close" size={18} color={c.muted} />
            </Pressable>
          </View>

          <T size={13}>
            {data?.reminder?.body ??
              (isTodayReminderDay
                ? `Today is your scheduled monthly savings day! Both partners are reminded to add their contributions toward the ${money(s?.vault.monthly_target ?? 0, cur)} target.`
                : isApproaching
                ? `Your scheduled monthly savings day is on the ${reminderDay}th. Get ready to save!`
                : `Your monthly contribution day was on the ${reminderDay}th. So far ${money(monthTotal, cur)} of ${money(s?.vault.monthly_target ?? 0, cur)} has been saved this month.`)}
          </T>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <T size={11} muted>
              Scheduled for day {reminderDay} of every month for both partners
            </T>
            {isVaultOwner && (
              <Pressable onPress={() => setShowEditDay(!showEditDay)} hitSlop={6}>
                <T size={12} weight="700" color={c.accent}>
                  {showEditDay ? 'Cancel' : 'Change Day'}
                </T>
              </Pressable>
            )}
          </View>
        </Card>
      )}

      {/* Admin Quick Setting: Change Reminder Day */}
      {isVaultOwner && showEditDay && (
        <Card style={{ borderColor: c.accent, borderWidth: 1 }}>
          <T weight="700" size={15}>Set Dashboard Notification Day</T>
          <T size={12} muted>
            Select the day of the month when both you and your partner will see the savings notification on this dashboard:
          </T>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {[1, 5, 15, 20, 25, 28].map((d) => (
              <Pressable
                key={d}
                onPress={() => handleUpdateReminderDay(d)}
                disabled={savingDay}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: reminderDay === d ? c.accent : c.cardAlt,
                }}>
                <T size={13} weight="700" color={reminderDay === d ? c.onAccent : c.text}>
                  {d}
                </T>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="Or custom day (1-28)"
                value={newDay}
                onChangeText={setNewDay}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Button
              label="Set"
              loading={savingDay}
              onPress={() => {
                const parsed = parseInt(newDay, 10);
                if (parsed >= 1 && parsed <= 28) {
                  handleUpdateReminderDay(parsed);
                } else {
                  Alert.alert('Invalid Day', 'Please enter a day between 1 and 28.');
                }
              }}
            />
          </View>
        </Card>
      )}

      {s && (
        <Card>
          <T muted size={12}>Total duo balance</T>
          <T size={36} weight="800">{money(s.available, cur)}</T>
          {s.loanedOut > 0 && <T size={12} muted>{money(s.totalDeposited, cur)} saved, {money(s.loanedOut, cur)} out on loan</T>}
          <ProgressBar parts={s.members.map((m, i) => ({ value: m.total, color: colors[i % 2] }))} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {s.members.map((m, i) => (
              <View key={m.id}>
                <T size={12} muted color={colors[i % 2]}>{m.id === me?.profile.id ? `${m.name} (you)` : m.name}</T>
                <T weight="700">{money(m.total, cur)}</T>
              </View>
            ))}
          </View>
        </Card>
      )}

      {s && s.vault.monthly_target > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700">This month's target</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={14} color={c.accent} />
              <T size={12} weight="600" color={c.accent}>Day {reminderDay} reminder</T>
            </View>
          </View>
          <ProgressBar parts={[
            { value: Math.min(monthTotal, s.vault.monthly_target), color: c.accent },
            { value: Math.max(s.vault.monthly_target - monthTotal, 0), color: 'transparent' },
          ]} />
          <T size={12} muted>{money(monthTotal, cur)} of {money(s.vault.monthly_target, cur)} target</T>
        </Card>
      )}

      {s && s.vault.savings_goal > 0 && (
        <Card>
          <T weight="700">Long-term goal</T>
          <ProgressBar parts={[
            { value: Math.min(s.available, s.vault.savings_goal), color: c.accent },
            { value: Math.max(s.vault.savings_goal - s.available, 0), color: 'transparent' },
          ]} />
          <T size={12} muted>{Math.round((s.available / s.vault.savings_goal) * 100)}% of {money(s.vault.savings_goal, cur)}</T>
        </Card>
      )}

      <Card>
        <T weight="700" size={16}>Add your savings</T>
        <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Salary, bonus, monthly contribution..." />
        <ErrorText msg={err} />
        <Button label="Save" onPress={save} loading={busy} />
      </Card>

      {!me?.partner && me?.vault && (
        <Card>
          <T weight="700">Invite your partner</T>
          <T size={22} weight="800" color={c.accent}>{me.vault.invite_code}</T>
          <T size={12} muted>They enter this code after creating an account.</T>
        </Card>
      )}
    </Screen>
  );
}
