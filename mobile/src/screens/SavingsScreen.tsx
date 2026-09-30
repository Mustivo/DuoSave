import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Notif, Summary } from '../types';
import { Button, Card, ErrorText, Input, ProgressBar, Screen, T, money, useLoad } from '../ui';

export default function SavingsScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, notifs] = await Promise.all([api.get<Summary>('/vault/summary'), api.get<Notif[]>('/notifications')]);
    return { summary, reminder: notifs.find((n) => n.type === 'reminder' && !n.read) ?? null };
  });
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!(n > 0)) { setErr('Enter an amount greater than 0'); return; }
    setBusy(true); setErr(null);
    try { await api.post('/savings', { amount: n, note: note || undefined }); setAmount(''); setNote(''); await reload(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const s = data?.summary; const cur = s?.vault.currency ?? 'USD';
  const colors = [c.accent, c.blue];
  const monthTotal = s?.members.reduce((t, m) => t + m.thisMonth, 0) ?? 0;

  return (
    <Screen title="Savings" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />
      {data?.reminder && (
        <Card style={{ borderColor: c.accent }}>
          <T weight="700" color={c.accent}>{data.reminder.title}</T>
          <T size={13}>{data.reminder.body}</T>
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
          <T weight="700">This month</T>
          <ProgressBar parts={[{ value: Math.min(monthTotal, s.vault.monthly_target), color: c.accent }, { value: Math.max(s.vault.monthly_target - monthTotal, 0), color: 'transparent' }]} />
          <T size={12} muted>{money(monthTotal, cur)} of {money(s.vault.monthly_target, cur)} target</T>
        </Card>
      )}
      {s && s.vault.savings_goal > 0 && (
        <Card>
          <T weight="700">Goal</T>
          <ProgressBar parts={[{ value: Math.min(s.available, s.vault.savings_goal), color: c.accent }, { value: Math.max(s.vault.savings_goal - s.available, 0), color: 'transparent' }]} />
          <T size={12} muted>{Math.round((s.available / s.vault.savings_goal) * 100)}% of {money(s.vault.savings_goal, cur)}</T>
        </Card>
      )}
      <Card>
        <T weight="700" size={16}>Add your savings</T>
        <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Salary, bonus..." />
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
