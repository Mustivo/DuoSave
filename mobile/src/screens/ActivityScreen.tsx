import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { ActivityItem } from '../types';
import { Card, ConfirmModal, ErrorText, Screen, StatusModal, SwipeableItem, T, money, timeAgo, useLoad } from '../ui';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  deposit: 'arrow-down',
  loan: 'arrow-up',
  repayment: 'refresh',
  reminder: 'notifications',
  join: 'log-in-outline',
};

export default function ActivityScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { data, loading, error, reload } = useLoad(async () => {
    const items = await api.get<ActivityItem[]>('/activity');
    api.post('/notifications/read').catch(() => {});
    return items;
  });

  const [items, setItems] = useState<ActivityItem[]>([]);
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

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const handleClearNotifications = async () => {
    setConfirmVisible(false);
    setItems([]);
    try {
      await Promise.all([
        api.delete('/activity'),
        api.delete('/notifications').catch(() => {}),
      ]);
      await reload();
      setStatusConfig({
        visible: true,
        title: t('cleared_title'),
        message: t('cleared_msg'),
        type: 'success',
      });
    } catch (e: any) {
      await reload();
      setStatusConfig({
        visible: true,
        title: t('error'),
        message: e.message || 'Could not clear activity',
        type: 'error',
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await api.delete(`/activity/${id}`).catch(() => {});
      await api.delete(`/notifications/${id}`).catch(() => {});
    } catch (e: any) {
      console.warn('Could not delete item:', e?.message);
    }
  };

  const color = (type: string) => (type === 'loan' ? c.warn : type === 'deposit' || type === 'repayment' ? c.accent : c.blue);

  const typeLabel = (type: string) => {
    if (type === 'deposit') return 'Savings';
    if (type === 'loan') return 'Loan';
    if (type === 'repayment') return 'Repayment';
    if (type === 'reminder') return 'Reminder';
    return 'Partner Activity';
  };

  return (
    <Screen title={t('activity_title')} onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Clear Notifications Header Action */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <T weight="700" size={15}>{t('activity_feed')}</T>
        {items.length > 0 && (
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
            <T size={12} weight="700" color={c.danger}>{t('clear_all')}</T>
          </Pressable>
        )}
      </View>

      {/* Swipe Right to Delete Hint */}
      {items.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Ionicons name="arrow-forward" size={14} color={c.muted} />
          <T size={12} muted>{t('swipe_to_delete_hint')}</T>
        </View>
      )}

      {items.length === 0 && !loading && (
        <Card style={{ padding: 24, alignItems: 'center', gap: 8 }}>
          <Ionicons name="notifications-outline" size={36} color={c.muted} />
          <T muted style={{ textAlign: 'center' }}>{t('empty_activity')}</T>
        </Card>
      )}

      {items.map((a) => {
        const itemColor = color(a.type);
        const isLoginOrJoin = a.type === 'join';
        return (
          <SwipeableItem key={a.id} onDelete={() => handleDeleteItem(a.id)}>
            <Card style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderLeftWidth: 3.5,
              borderLeftColor: itemColor,
            }}>
              {/* Highlighted Icon Badge */}
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: itemColor + '20',
                borderWidth: 1,
                borderColor: itemColor + '40',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Ionicons name={icons[a.type] ?? 'ellipse'} size={20} color={itemColor} />
              </View>

              {/* Message & Details */}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{
                    backgroundColor: itemColor + '18',
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 4,
                  }}>
                    <T size={10} weight="800" color={itemColor} style={{ textTransform: 'uppercase' }}>
                      {typeLabel(a.type)}
                    </T>
                  </View>
                  <T size={11} muted>{timeAgo(a.created_at)}</T>
                </View>

                <T weight={isLoginOrJoin ? '700' : '600'} size={14} color={c.text} style={{ lineHeight: 19 }}>
                  {a.message}
                </T>
              </View>

              {/* Amount Tag */}
              {a.amount ? (
                <View style={{ alignItems: 'flex-end', marginLeft: 4 }}>
                  <T weight="800" size={14} color={itemColor}>
                    {a.type === 'loan' ? '-' : '+'}{money(Number(a.amount))}
                  </T>
                </View>
              ) : null}

              {/* Delete Icon */}
              <Pressable
                onPress={() => handleDeleteItem(a.id)}
                hitSlop={8}
                style={({ pressed }) => ({
                  padding: 6,
                  borderRadius: 8,
                  backgroundColor: c.danger + '14',
                  opacity: pressed ? 0.6 : 1,
                  marginLeft: 4,
                })}>
                <Ionicons name="trash-outline" size={15} color={c.danger} />
              </Pressable>
            </Card>
          </SwipeableItem>
        );
      })}

      {/* Confirmation Modal */}
      <ConfirmModal
        visible={confirmVisible}
        title={t('clear_all_title')}
        message={t('clear_all_msg')}
        icon="trash-outline"
        confirmLabel={t('clear_all')}
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
