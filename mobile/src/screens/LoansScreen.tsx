import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Loan, Summary } from '../types';
import { Button, Card, ErrorText, Input, Screen, T, money, useLoad } from '../ui';

export default function LoansScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, loans] = await Promise.all([api.get<Summary>('/vault/summary'), api.get<Loan[]>('/loans')]);
    return { summary, loans };
  });
  const [amount, setAmount] = useState(''); const [purpose, setPurpose] = useState('');
  const [repay, setRepay] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const cur = data?.summary.vault.currency ?? 'USD';
  const nameOf = (id: string) => data?.summary.members.find((m) => m.id === id)?.name ?? 'Partner';

  const take = () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!(n > 0)) { setErr('Enter an amount greater than 0'); return; }
    Alert.alert('Take this loan?', `${money(n, cur)} leaves the shared savings right away. Your partner will be told.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take loan', onPress: async () => {
        setBusy(true); setErr(null);
        try { await api.post('/loans', { amount: n, purpose: purpose || undefined }); setAmount(''); setPurpose(''); await reload(); }
        catch (e: any) { setErr(e.message); }
        setBusy(false);
      } },
    ]);
  };

  const pay = async (id: string) => {
    const n = parseFloat((repay[id] ?? '').replace(',', '.'));
    if (!(n > 0)) { setErr('Enter a repayment amount'); return; }
    setErr(null);
    try { await api.post(`/loans/${id}/repay`, { amount: n }); setRepay({ ...repay, [id]: '' }); await reload(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <Screen title="Loans" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />
      {data && (
        <Card>
          <T muted size={12}>Available to borrow</T>
          <T size={32} weight="800">{money(data.summary.available, cur)}</T>
          <T size={12} muted>Taking a loan lowers the shared total immediately. Repaying puts it back.</T>
        </Card>
      )}
      <Card>
        <T weight="700" size={16}>Take a loan</T>
        <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Input label="Purpose (optional)" value={purpose} onChangeText={setPurpose} placeholder="Flight tickets" />
        <ErrorText msg={err} />
        <Button label="Take loan" onPress={take} loading={busy} />
      </Card>
      <T weight="700" size={16}>All loans</T>
      {data?.loans.length === 0 && <T muted>No loans yet.</T>}
      {data?.loans.map((l) => {
        const owed = Number(l.amount) - Number(l.repaid);
        const mine = l.borrower_id === me?.profile.id;
        return (
          <Card key={l.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T weight="700">{mine ? 'You' : nameOf(l.borrower_id)}{l.purpose ? `: ${l.purpose}` : ''}</T>
              <T weight="700" color={l.status === 'repaid' ? c.accent : c.warn}>{l.status === 'repaid' ? 'Repaid' : 'Active'}</T>
            </View>
            <T size={13} muted>{money(Number(l.repaid), cur)} repaid of {money(Number(l.amount), cur)}</T>
            {l.status === 'active' && mine && (
              <View style={{ gap: 8 }}>
                <Input value={repay[l.id] ?? ''} onChangeText={(v) => setRepay({ ...repay, [l.id]: v })} keyboardType="decimal-pad" placeholder={`Up to ${owed.toFixed(2)}`} />
                <Button label="Repay" variant="ghost" onPress={() => pay(l.id)} />
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
