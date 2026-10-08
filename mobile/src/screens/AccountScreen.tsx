import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { Mode, useTheme } from '../theme';
import { Button, Card, ErrorText, Input, Screen, T } from '../ui';

export default function AccountScreen() {
  const { c, mode, setMode } = useTheme();
  const { me, refreshMe, signOut } = useAuth();
  const v = me?.vault;
  const [goal, setGoal] = useState(''); const [target, setTarget] = useState(''); const [day, setDay] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!v) return;
    setGoal(String(v.savings_goal)); setTarget(String(v.monthly_target)); setDay(String(v.reminder_day));
  }, [v?.id]);

  const saveSettings = async () => {
    setErr(null);
    try {
      await api.patch('/vault', {
        savings_goal: parseFloat(goal) || 0, monthly_target: parseFloat(target) || 0, reminder_day: parseInt(day, 10) || 1,
      });
      await refreshMe(); Alert.alert('Saved', 'Vault settings updated.');
    } catch (e: any) { setErr(e.message); }
  };
  const remindNow = async () => {
    try { await api.post('/vault/remind'); Alert.alert('Sent', 'Both of you were asked to save.'); }
    catch (e: any) { setErr(e.message); }
  };

  const isAdmin = !!(v && me?.profile?.id && v.created_by === me.profile.id);

  return (
    <Screen title="Account">
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{me?.profile.name}</T>
          {isAdmin && (
            <View style={{ backgroundColor: c.accent + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <T size={12} weight="700" color={c.accent}>👑 Admin</T>
            </View>
          )}
        </View>
        <T muted size={13}>{me?.partner ? `Saving with ${me.partner.name}` : 'Waiting for your partner to join'}</T>
        {v && <T size={13} muted>Invite code: <T weight="700" color={c.accent}>{v.invite_code}</T></T>}
      </Card>

      <Card>
        <T weight="700" size={16}>Appearance</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
              backgroundColor: mode === m ? c.accent : c.cardAlt,
            }}>
              <T weight="600" color={mode === m ? c.onAccent : c.text}>{m[0].toUpperCase() + m.slice(1)}</T>
            </Pressable>
          ))}
        </View>
      </Card>

      {v && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700" size={16}>Savings plan</T>
            {!isAdmin && <T size={12} muted>Managed by {me?.partner?.name ?? 'Admin'}</T>}
          </View>
          <Input label={`Savings goal (${v.currency})`} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" editable={isAdmin} />
          <Input label="Monthly target for both of you" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={isAdmin} />
          <Input label="Reminder day of the month (1 to 28)" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} editable={isAdmin} />
          <ErrorText msg={err} />
          {isAdmin ? (
            <Button label="Save plan" onPress={saveSettings} />
          ) : (
            <T size={12} muted style={{ textAlign: 'center' }}>Only the vault admin can edit the savings plan</T>
          )}
          <Button label="Send reminder now" variant="ghost" onPress={remindNow} />
        </Card>
      )}
      <Button label="Log out" variant="danger" onPress={signOut} />
    </Screen>
  );
}
