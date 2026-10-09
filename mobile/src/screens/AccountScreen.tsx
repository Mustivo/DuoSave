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
  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('');
  const [day, setDay] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Partner account management for Steven (Master Admin)
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pPassword, setPPassword] = useState('');
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [pSuccess, setPSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!v) return;
    setGoal(String(v.savings_goal));
    setTarget(String(v.monthly_target));
    setDay(String(v.reminder_day));
  }, [v?.id]);

  useEffect(() => {
    if (me?.partner?.name && !pName) {
      setPName(me.partner.name);
    }
  }, [me?.partner?.name]);

  const saveSettings = async () => {
    setErr(null);
    try {
      await api.patch('/vault', {
        savings_goal: parseFloat(goal) || 0,
        monthly_target: parseFloat(target) || 0,
        reminder_day: parseInt(day, 10) || 1,
      });
      await refreshMe();
      Alert.alert('Saved', 'Vault settings updated.');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const remindNow = async () => {
    try {
      await api.post('/vault/remind');
      Alert.alert('Sent', 'Both of you were asked to save.');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const isSteven = !!(
    me?.isAdmin ||
    me?.profile?.id === 'c0e5aa93-e6ab-4a6a-971e-bcfc8c4980b8' ||
    me?.profile?.name?.toLowerCase().includes('steven') ||
    me?.profile?.email?.toLowerCase().includes('stevenmwizerwa') ||
    (v && me?.profile?.id && v.created_by === me.profile.id)
  );

  const handleSavePartner = async () => {
    if (!pName.trim()) {
      setPErr('Enter the partner name');
      return;
    }
    if (!pEmail.trim() || !pEmail.includes('@')) {
      setPErr('Enter a valid email address');
      return;
    }
    if (pPassword.length < 6) {
      setPErr('Password must be at least 6 characters');
      return;
    }
    setPErr(null);
    setPSuccess(null);
    setPBusy(true);
    try {
      const res = await api.post<{ ok: boolean; partner: { id: string; name: string; email: string } }>('/vault/partner', {
        name: pName.trim(),
        email: pEmail.trim().toLowerCase(),
        password: pPassword,
      });
      setPSuccess(`Partner ${res.partner.name} (${res.partner.email}) is linked! Credentials have been sent to their email.`);
      setPPassword('');
      Alert.alert('Partner Account Ready', `Account for ${res.partner.name} (${res.partner.email}) was created.\n\nAn email with their login credentials has been sent to their inbox!`);
      await refreshMe();
    } catch (e: any) {
      setPErr(e.message);
    } finally {
      setPBusy(false);
    }
  };

  return (
    <Screen title="Account">
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{me?.profile.name}</T>
          {isSteven && (
            <View style={{ backgroundColor: c.accent + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <T size={12} weight="700" color={c.accent}>👑 Master Admin</T>
            </View>
          )}
        </View>
        {me?.profile?.email && <T muted size={13}>{me.profile.email}</T>}
        <T muted size={13}>{me?.partner ? `Partner: ${me.partner.name}` : 'Waiting for partner account setup'}</T>
        {v && <T size={13} muted>Invite code: <T weight="700" color={c.accent}>{v.invite_code}</T></T>}
      </Card>

      {/* Admin Partner Creation and Management Card */}
      {isSteven && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700" size={16}>Manage Partner Account</T>
            <View style={{ backgroundColor: c.accent + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <T size={11} weight="600" color={c.accent}>Admin Only</T>
            </View>
          </View>
          <T size={13} muted>
            As Master Admin, you have full control to create or update your partner's login account directly.
          </T>
          {me?.partner && (
            <View style={{ backgroundColor: c.cardAlt, padding: 10, borderRadius: 10 }}>
              <T size={13} weight="600">Currently Linked Partner: <T color={c.accent}>{me.partner.name}</T></T>
            </View>
          )}
          <Input label="Partner Name" placeholder="e.g. Partner Name" value={pName} onChangeText={setPName} />
          <Input label="Partner Email" placeholder="partner@email.com" keyboardType="email-address" autoCapitalize="none" value={pEmail} onChangeText={setPEmail} />
          <Input label="Partner Password (min 6 chars)" placeholder="Set login password" secureTextEntry value={pPassword} onChangeText={setPPassword} />
          {pSuccess && <T size={13} color={c.accent} weight="600">{pSuccess}</T>}
          <ErrorText msg={pErr} />
          <Button label={pBusy ? 'Saving...' : me?.partner ? 'Update / Set Partner Account' : 'Create & Link Partner'} onPress={handleSavePartner} loading={pBusy} />
        </Card>
      )}

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
            {!isSteven && <T size={12} muted>Managed by {me?.partner?.name ?? 'Admin'}</T>}
          </View>
          <Input label={`Savings goal (${v.currency})`} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" editable={isSteven} />
          <Input label="Monthly target for both of you" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={isSteven} />
          <Input label="Reminder day of the month (1 to 28)" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} editable={isSteven} />
          <ErrorText msg={err} />
          {isSteven ? (
            <Button label="Save plan" onPress={saveSettings} />
          ) : (
            <T size={12} muted style={{ textAlign: 'center' }}>Only the master admin can edit the savings plan</T>
          )}
          <Button label="Send reminder now" variant="ghost" onPress={remindNow} />
        </Card>
      )}
      <Button label="Log out" variant="danger" onPress={signOut} />
    </Screen>
  );
}
