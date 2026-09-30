import React from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Contribution, Summary } from '../types';
import { Card, ErrorText, ProgressBar, Screen, T, money, useLoad } from '../ui';

export default function AnalyticsScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, list] = await Promise.all([api.get<Summary>('/vault/summary'), api.get<Contribution[]>('/savings')]);
    return { summary, list };
  });
  const cur = data?.summary.vault.currency ?? 'USD';
  const colors = [c.accent, c.blue];
  const members = data?.summary.members ?? [];

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en-US', { month: 'short' }) };
  });
  const perMonth = months.map((mo) => members.map((m) =>
    (data?.list ?? []).filter((x) => x.user_id === m.id && (() => { const d = new Date(x.created_at); return `${d.getFullYear()}-${d.getMonth()}` === mo.key; })())
      .reduce((s, x) => s + Number(x.amount), 0)));
  const max = Math.max(1, ...perMonth.map((p) => p.reduce((a, b) => a + b, 0)));
  const total = members.reduce((s, m) => s + m.total, 0);

  return (
    <Screen title="Analytics" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />
      <Card>
        <T weight="700" size={16}>Saved per month</T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 10 }}>
          {perMonth.map((p, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {p.map((v, j) => <View key={j} style={{ width: '100%', height: (v / max) * 110, backgroundColor: colors[j % 2] }} />)}
              <T size={11} muted style={{ marginTop: 4 }}>{months[i].label}</T>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <T weight="700" size={16}>Who saved what</T>
        <ProgressBar parts={members.map((m, i) => ({ value: m.total, color: colors[i % 2] }))} />
        {members.map((m, i) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T color={colors[i % 2]} weight="600">{m.id === me?.profile.id ? `${m.name} (you)` : m.name}</T>
            <T>{money(m.total, cur)} ({total ? Math.round((m.total / total) * 100) : 0}%)</T>
          </View>
        ))}
      </Card>
      <Card>
        <T weight="700" size={16}>Money out on loan</T>
        {members.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T muted>{m.name} owes</T><T>{money(m.owed, cur)}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
