import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { Loan, Notif, Summary } from '../types';
import { Button, Card, ErrorText, Input, ProgressBar, Screen, StatusModal, SwipeableItem, T, money, useLoad } from '../ui';

export default function SavingsScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { me, refreshMe } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, notifs, loans] = await Promise.all([
      api.get<Summary>('/vault/summary'),
      api.get<Notif[]>('/notifications'),
      api.get<Loan[]>('/loans').catch(() => [] as Loan[]),
    ]);
    return {
      summary,
      reminder: notifs.find((n) => n.type === 'reminder' && !n.read) ?? null,
      partnerNotif: notifs.find((n) => n.type === 'partner' && !n.read) ?? null,
      pendingLoanForMe: loans.find((l) => l.status === 'pending' && l.borrower_id !== me?.profile?.id) ?? null,
      allNotifs: notifs.filter((n) => !n.read),
    };
  });

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-refresh savings and notifications every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      reload().catch(() => { });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Quick edit reminder day modal/input state for admin
  const [showEditDay, setShowEditDay] = useState(false);
  const [newDay, setNewDay] = useState('');
  const [savingDay, setSavingDay] = useState(false);
  const [dismissedLocalReminder, setDismissedLocalReminder] = useState(false);

  // Modern Status Modal State
  const [statusConfig, setStatusConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const isVaultOwner = me?.profile?.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com';

  const save = async () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!(n > 0)) { setErr('Enter an amount greater than 0'); return; }
    setBusy(true); setErr(null);
    try {
      await api.post('/savings', { amount: n, note: note || undefined });
      setAmount(''); setNote('');
      await reload();
      setStatusConfig({
        visible: true,
        title: t('savings_added_title'),
        message: t('savings_added_msg', { amount: money(n, cur) }),
        type: 'success',
      });
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
      setStatusConfig({
        visible: true,
        title: 'Reminder Day Set',
        message: `Both partners will see the notification banner on day ${selectedDay} of every month.`,
        type: 'success',
      });
    } catch (e: any) {
      setStatusConfig({
        visible: true,
        title: t('error'),
        message: e.message,
        type: 'error',
      });
    } finally {
      setSavingDay(false);
    }
  };

  const handleDismissReminder = async () => {
    setDismissedLocalReminder(true);
    try {
      await api.delete('/notifications');
      await reload();
    } catch { }
  };

  const s = data?.summary;
  const cur = s?.vault.currency ?? 'RWF';
  const memberColors = [c.accent, c.blue, '#9b5de5', '#f15bb5', '#fee440', '#00bbf9', '#00f5d4'];
  const monthTotal = s?.members.reduce((tot, m) => tot + m.thisMonth, 0) ?? 0;
  const reminderDay = s?.vault.reminder_day ?? 1;

  // Calculate day-of-month logic
  const today = new Date();
  const currentDay = today.getDate();
  const isTodayReminderDay = currentDay === reminderDay;
  const daysUntilReminder = reminderDay >= currentDay ? reminderDay - currentDay : (30 - currentDay + reminderDay);
  const isApproaching = daysUntilReminder > 0 && daysUntilReminder <= 3;
  const isPastDue = currentDay > reminderDay && monthTotal < (s?.vault.monthly_target ?? 0);

  return (
    <Screen title={t('savings_title')} onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Immediate Partner Activity & Savings Notification Banner */}
      {data?.partnerNotif && (
        <SwipeableItem onDelete={handleDismissReminder}>
          <Card style={{
            borderColor: c.accent,
            borderWidth: 1.5,
            borderRadius: 18,
            backgroundColor: c.accent + '14',
            padding: 16,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: c.accent + '25',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ionicons name="sparkles" size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="800" size={15} color={c.accent}>{data.partnerNotif.title}</T>
                  <T size={13} color={c.text} style={{ lineHeight: 18 }}>{data.partnerNotif.body}</T>
                  <T size={11} muted style={{ marginTop: 2 }}>{t('swipe_to_dismiss')}</T>
                </View>
              </View>
              <Pressable onPress={handleDismissReminder} hitSlop={10} style={{ padding: 6 }}>
                <Ionicons name="close" size={18} color={c.muted} />
              </Pressable>
            </View>
          </Card>
        </SwipeableItem>
      )}

      {/* Immediate Pending Loan Request Requiring Approval */}
      {data?.pendingLoanForMe && (
        <Card style={{
          borderColor: c.warn,
          borderWidth: 1.5,
          borderRadius: 18,
          backgroundColor: c.warn + '18',
          padding: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: c.warn + '25',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="alert-circle" size={22} color={c.warn} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="800" size={15} color={c.warn}>{t('loan_review_needed')}</T>
              <T size={13} color={c.text}>
                {t('loan_review_desc', { amount: money(Number(data.pendingLoanForMe.amount), cur) })}
              </T>
            </View>
          </View>
        </Card>
      )}

      {/* Dynamic Modern Notification Banner displayed for BOTH users based on reminder_day */}
      {!dismissedLocalReminder && (data?.reminder || isTodayReminderDay || isApproaching || isPastDue) && (() => {
        const statusColor = isPastDue ? c.warn : isTodayReminderDay ? c.accent : c.blue;
        const statusBadge = isTodayReminderDay
          ? 'SAVINGS DAY • DUE TODAY'
          : isApproaching
            ? `UPCOMING DEADLINE • ${daysUntilReminder} DAY${daysUntilReminder > 1 ? 'S' : ''} LEFT`
            : isPastDue
              ? `PAYMENT OVERDUE • DUE DAY ${reminderDay}`
              : `SAVINGS REMINDER • DAY ${reminderDay}`;

        const statusTitle = isTodayReminderDay
          ? `Monthly Savings Day! (Day ${reminderDay})`
          : isApproaching
            ? `Savings Deadline in ${daysUntilReminder} day${daysUntilReminder > 1 ? 's' : ''}`
            : isPastDue
              ? `Contribution Needed for Day ${reminderDay}`
              : (data?.reminder?.title ?? t('reminder_banner_title'));

        const targetAmount = s?.vault.monthly_target ?? 6000;
        const partnersCount = Math.max(1, s?.members.length ?? 1);
        const requiredPerPartner = Math.round(targetAmount / partnersCount);
        const targetPct = targetAmount > 0 ? Math.min(100, Math.round((monthTotal / targetAmount) * 100)) : 0;

        return (
          <Card style={{
            borderColor: statusColor,
            borderWidth: 1.5,
            borderRadius: 20,
            padding: 18,
            backgroundColor: statusColor + '10',
            gap: 12,
          }}>
            {/* Header: Status Pill Badge & Close Button */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: statusColor + '22',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                <T size={11} weight="800" color={statusColor}>
                  {statusBadge}
                </T>
              </View>

              <Pressable
                onPress={handleDismissReminder}
                hitSlop={10}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: c.cardAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="close" size={16} color={c.muted} />
              </Pressable>
            </View>

            {/* Title & Description */}
            <View style={{ gap: 4 }}>
              <T weight="800" size={17} color={c.text}>
                {statusTitle}
              </T>
              <T size={13} muted style={{ lineHeight: 19 }}>
                {data?.reminder?.body ??
                  (isTodayReminderDay
                    ? `Today is your scheduled monthly savings day (Day ${reminderDay})! You are required to contribute your monthly share of ${money(requiredPerPartner, cur)} (Shared vault target: ${money(targetAmount, cur)}).`
                    : isApproaching
                      ? `Upcoming deadline in ${daysUntilReminder} day${daysUntilReminder > 1 ? 's' : ''} (Day ${reminderDay})! You are required to contribute your monthly share of ${money(requiredPerPartner, cur)} (Shared vault target: ${money(targetAmount, cur)}).`
                      : `Monthly savings deadline was on day ${reminderDay}. You are required to contribute your monthly share of ${money(requiredPerPartner, cur)} (Shared vault target: ${money(targetAmount, cur)}).`)}
              </T>
            </View>

            {/* Target Breakdown Metric Box */}
            <View style={{
              backgroundColor: c.cardAlt,
              borderRadius: 14,
              padding: 12,
              borderWidth: 1,
              borderColor: c.border,
              gap: 8,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ gap: 2 }}>
                  <T size={10} weight="700" muted>YOUR REQUIRED SHARE</T>
                  <T size={16} weight="800" color={statusColor}>
                    {money(requiredPerPartner, cur)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T size={10} weight="700" muted>VAULT TARGET (TOTAL)</T>
                  <T size={15} weight="800" color={c.text}>
                    {money(targetAmount, cur)}
                  </T>
                </View>
              </View>
              <ProgressBar parts={[
                { value: Math.min(monthTotal, targetAmount), color: statusColor },
                { value: Math.max(targetAmount - monthTotal, 0), color: c.border + '60' },
              ]} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T size={11} muted>Total saved this month: {money(monthTotal, cur)}</T>
                <T size={11} weight="700" color={statusColor}>{targetPct}% completed</T>
              </View>
            </View>

            {/* Actions Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <Pressable
                onPress={() => {
                  const partnerShare = Math.round(targetAmount / Math.max(1, (me?.partners?.length ?? 1) + 1));
                  setAmount(String(partnerShare));
                  setStatusConfig({
                    visible: true,
                    title: 'Ready to Save',
                    message: `Suggested monthly share of ${money(partnerShare, cur)} has been filled below. Add your note and tap 'Save' to deposit.`,
                    type: 'info',
                  });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: statusColor,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}>
                <Ionicons name="add-circle-outline" size={16} color={c.onAccent} />
                <T size={13} weight="800" color={c.onAccent}>
                  + Save Now
                </T>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isVaultOwner && (
                  <Pressable
                    onPress={() => setShowEditDay(!showEditDay)}
                    hitSlop={6}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: c.cardAlt,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}>
                    <Ionicons name="calendar-outline" size={14} color={c.accent} />
                    <T size={12} weight="700" color={c.accent}>
                      {showEditDay ? t('cancel') : t('change_day')}
                    </T>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Schedule footer note */}
            <T size={11} muted>
              Scheduled for day {reminderDay} of every month for both partners
            </T>
          </Card>
        );
      })()}

      {/* Admin Quick Setting: Change Reminder Day */}
      {isVaultOwner && showEditDay && (
        <Card style={{ borderColor: c.accent, borderWidth: 1 }}>
          <T weight="700" size={15}>{t('set_dashboard_notification_day')}</T>
          <T size={12} muted>
            {t('select_day_desc')}
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
                placeholder={t('custom_day_placeholder')}
                value={newDay}
                onChangeText={setNewDay}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Button
              label={t('set')}
              loading={savingDay}
              onPress={() => {
                const parsed = parseInt(newDay, 10);
                if (parsed >= 1 && parsed <= 28) {
                  handleUpdateReminderDay(parsed);
                } else {
                  setStatusConfig({
                    visible: true,
                    title: t('invalid_day_title'),
                    message: t('invalid_day_msg'),
                    type: 'error',
                  });
                }
              }}
            />
          </View>
        </Card>
      )}

      {s && (
        <Card>
          <T muted size={12}>{t('total_balance')}</T>
          <T size={36} weight="800">{money(s.available, cur)}</T>
          {s.loanedOut > 0 && (
            <View style={{
              backgroundColor: c.warn + '15',
              borderColor: c.warn + '40',
              borderWidth: 1,
              borderRadius: 12,
              padding: 10,
              gap: 3,
            }}>
              <T size={11} color={c.warn} weight="700">Vault Balance Equation:</T>
              <T size={13} weight="800" color={c.text}>
                {money(s.totalDeposited, cur)} (Total) – {money(s.loanedOut, cur)} (Loan Taken) = {money(s.available, cur)} Available
              </T>
            </View>
          )}
          <ProgressBar parts={[
            ...(s.accountSavings && s.accountSavings > 0 ? [{ value: s.accountSavings, color: c.accent }] : []),
            ...s.members.map((m, i) => ({ value: m.total, color: memberColors[(i + 1) % memberColors.length] })),
          ]} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            {s.accountSavings !== undefined && s.accountSavings > 0 && (
              <View style={{ minWidth: 90 }}>
                <T size={12} muted color={c.accent}>{t('account_funds')}</T>
                <T weight="700">{money(s.accountSavings, cur)}</T>
              </View>
            )}
            <View style={{ minWidth: 90 }}>
              <T size={12} muted color={c.warn}>{t('loan_profit')}</T>
              <T weight="700" color={c.warn}>{money(s.loanProfit ?? 0, cur)}</T>
            </View>
            {s.members.map((m, i) => (
              <View key={m.id} style={{ minWidth: 90 }}>
                <T size={12} muted color={memberColors[(i + 1) % memberColors.length]}>
                  {m.id === me?.profile.id ? `${m.name} (${t('you_label')})` : m.name}
                </T>
                <T weight="700">{money(m.total, cur)}</T>
              </View>
            ))}
          </View>
        </Card>
      )}

      {s && s.vault.monthly_target > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700">{t('this_month_target')}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={14} color={c.accent} />
              <T size={12} weight="600" color={c.accent}>{t('day_reminder', { day: reminderDay })}</T>
            </View>
          </View>
          <ProgressBar parts={[
            { value: Math.min(monthTotal, s.vault.monthly_target), color: c.accent },
            { value: Math.max(s.vault.monthly_target - monthTotal, 0), color: 'transparent' },
          ]} />
          <T size={12} muted>
            {t('target_progress', { current: money(monthTotal, cur), target: money(s.vault.monthly_target, cur) })}
          </T>
        </Card>
      )}

      {s && s.vault.savings_goal > 0 && (
        <Card>
          <T weight="700">{t('long_term_goal')}</T>
          <ProgressBar parts={[
            { value: Math.min(s.available, s.vault.savings_goal), color: c.accent },
            { value: Math.max(s.vault.savings_goal - s.available, 0), color: 'transparent' },
          ]} />
          <T size={12} muted>
            {t('goal_progress', { percent: Math.round((s.available / s.vault.savings_goal) * 100), goal: money(s.vault.savings_goal, cur) })}
          </T>
        </Card>
      )}

      <Card>
        <T weight="700" size={16}>{t('add_your_savings')}</T>
        <Input label={`${t('amount_label')} (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        
        {/* Quick Note Selector: monthly, addition money, bonus */}
        <View style={{ gap: 6 }}>
          <T size={12} muted weight="600">{t('note_label')}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'monthly', label: 'Monthly' },
              { key: 'addition money', label: 'Addition money' },
              { key: 'bonus', label: 'Bonus' },
            ].map((item) => {
              const isSelected = note.toLowerCase() === item.key.toLowerCase();
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setNote(item.label)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: isSelected ? c.accent : c.border,
                    backgroundColor: isSelected ? c.accent + '22' : c.cardAlt,
                  }}>
                  <T size={12} weight={isSelected ? '800' : '600'} color={isSelected ? c.accent : c.text}>
                    {item.label}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input value={note} onChangeText={setNote} placeholder="Or enter custom note..." />
        <ErrorText msg={err} />
        <Button label={t('save')} onPress={save} loading={busy} />
      </Card>

      {!me?.partner && me?.vault && (
        <Card>
          <T weight="700">{t('invite_partner')}</T>
          <T size={22} weight="800" color={c.accent}>{me.vault.invite_code}</T>
          <T size={12} muted>{t('invite_partner_desc')}</T>
        </Card>
      )}

      {/* Modern Status/Feedback Popup */}
      <StatusModal
        visible={statusConfig.visible}
        title={statusConfig.title}
        message={statusConfig.message}
        type={statusConfig.type}
        onClose={() => setStatusConfig((prev) => ({ ...prev, visible: false }))}
      />
    </Screen>
  );
}
