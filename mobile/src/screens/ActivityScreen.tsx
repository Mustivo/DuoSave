import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useTheme } from '../theme';
import { ActivityItem } from '../types';
import { Card, ConfirmModal, ErrorText, Screen, StatusModal, T, money, timeAgo, useLoad } from '../ui';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  deposit: 'arrow-down-circle',
  loan: 'arrow-up-circle',
  repayment: 'refresh-circle',
  reminder: 'alarm',
  join: 'person-add',
};

export default function ActivityScreen() {
  const { c } = useTheme();
  const { data, loading, error, reload } = useLoad(async () => {
    const items = await api.get<ActivityItem[]>('/activity');
    api.post('/notifications/read').catch(() => {});
    return items;
  });

  const [confirmVisible, setConfirmVisible] = useState(false);
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

  const handleClearNotifications = async () => {
    setConfirmVisible(false);
    try {
      await api.delete('/notifications');
      await reload();
      setStatusConfig({
        visible: true,
        title: 'Notifications Cleared',
        message: 'All notifications have been cleared from your account.',
        type: 'success',
      });
    } catch (e: any) {
      setStatusConfig({
        visible: true,
        title: 'Error',
        message: e.message || 'Could not clear notifications',
        type: 'error',
      });
    }
  };

  const color = (t: string) => (t === 'loan' ? c.warn : t === 'deposit' || t === 'repayment' ? c.accent : c.blue);

  return (
    <Screen title="Activity & Alerts" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Clear Notifications Header Action */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <T weight="700" size={15}>Activity Feed</T>
        <Pressable
          onPress={() => setConfirmVisible(true)}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: c.cardAlt,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.border,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Ionicons name="trash-outline" size={14} color={c.danger} />
          <T size={12} weight="700" color={c.danger}>Clear Notifications</T>
        </Pressable>
      </View>

      {data?.length === 0 && <T muted>Nothing yet. Savings and loans from your vault show up here.</T>}

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

      {/* Confirmation Modal */}
      <ConfirmModal
        visible={confirmVisible}
        title="Clear All Notifications?"
        message="Are you sure you want to clear all pending notifications and alerts from your device?"
        icon="trash-outline"
        confirmLabel="Clear Notifications"
        isDestructive={true}
        onConfirm={handleClearNotifications}
        onCancel={() => setConfirmVisible(false)}
      />

      {/* Status Modal */}
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
