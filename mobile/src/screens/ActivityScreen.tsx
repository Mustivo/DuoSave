import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useTheme } from '../theme';
import { ActivityItem } from '../types';
import { Card, ErrorText, Screen, T, money, timeAgo, useLoad } from '../ui';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  deposit: 'arrow-down-circle', loan: 'arrow-up-circle', repayment: 'refresh-circle', reminder: 'alarm', join: 'person-add',
};

export default function ActivityScreen() {
  const { c } = useTheme();
  const { data, loading, error, reload } = useLoad(async () => {
    const items = await api.get<ActivityItem[]>('/activity');
    api.post('/notifications/read').catch(() => {});
    return items;
  });
  const color = (t: string) => (t === 'loan' ? c.warn : t === 'deposit' || t === 'repayment' ? c.accent : c.blue);
  return (
    <Screen title="Activity" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />
      {data?.length === 0 && <T muted>Nothing yet. Savings and loans from both of you show up here.</T>}
      {data?.map((a) => (
        <Card key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={icons[a.type] ?? 'ellipse'} size={28} color={color(a.type)} />
          <View style={{ flex: 1 }}>
            <T weight="600">{a.message}</T>
            <T size={12} muted>{timeAgo(a.created_at)}</T>
          </View>
          {a.amount ? <T weight="700" color={color(a.type)}>{a.type === 'loan' ? '-' : '+'}{money(Number(a.amount))}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
