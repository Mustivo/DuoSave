import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { Mode, useTheme } from '../theme';
import { Button, Card, ConfirmModal, ErrorText, Input, Screen, StatusModal, T } from '../ui';

export default function AccountScreen() {
  const { c, mode, setMode } = useTheme();
  const { me, refreshMe, signOut } = useAuth();
  const v = me?.vault;
  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('');
  const [day, setDay] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Partner account management for the vault owner.
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [pSuccess, setPSuccess] = useState<string | null>(null);

  // Modern Confirmation & Status Modal States
  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    icon?: keyof typeof Ionicons.glyphMap;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

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
      setStatusConfig({
        visible: true,
        title: 'Plan Saved',
        message: 'Your vault savings goals and notification schedule have been updated.',
        type: 'success',
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const remindNow = async () => {
    try {
      await api.post('/vault/remind');
      setStatusConfig({
        visible: true,
        title: 'Reminder Sent',
        message: 'A savings notification was sent to both partner accounts.',
        type: 'success',
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const isVaultOwner = !!(v && me?.profile?.id && v.created_by === me.profile.id);

  const handleSavePartner = async () => {
    if (!pName.trim()) {
      setPErr('Enter the partner name');
      return;
    }
    if (!pEmail.trim() || !pEmail.includes('@')) {
      setPErr('Enter a valid email address');
      return;
    }
    setPErr(null);
    setPSuccess(null);
    setPBusy(true);
    try {
      const res = await api.post<{ ok: boolean; partner: { id: string; name: string; email: string } }>('/vault/partner', {
        name: pName.trim(),
        email: pEmail.trim().toLowerCase(),
      });
      setPSuccess(`Partner ${res.partner.name} (${res.partner.email}) is linked.`);
      setStatusConfig({
        visible: true,
        title: 'Partner Linked',
        message: `Account for ${res.partner.name} (${res.partner.email}) was created. A secure password setup code was emailed to them.`,
        type: 'success',
      });
      await refreshMe();
    } catch (e: any) {
      setPErr(e.message);
    } finally {
      setPBusy(false);
    }
  };

  const handleUnlinkPartner = () => {
    if (!me?.partner) return;

    setConfirmConfig({
      visible: true,
      title: 'Unlink Partner?',
      message: `Are you sure you want to remove ${me.partner.name} from this vault? They will lose access to shared savings.`,
      icon: 'person-remove-outline',
      confirmLabel: 'Unlink Partner',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setPBusy(true);
        setPErr(null);
        try {
          await api.delete('/vault/partner');
          await refreshMe();
          setStatusConfig({
            visible: true,
            title: 'Partner Unlinked',
            message: 'Partner has been safely removed from this vault.',
            type: 'info',
          });
        } catch (e: any) {
          setPErr(e.message);
        } finally {
          setPBusy(false);
        }
      },
    });
  };

  const confirmSignOut = () => {
    setConfirmConfig({
      visible: true,
      title: 'Sign Out?',
      message: 'Are you sure you want to log out of your DuoSave account on this device?',
      icon: 'log-out-outline',
      confirmLabel: 'Log Out',
      isDestructive: true,
      onConfirm: () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        signOut();
      },
    });
  };

  return (
    <Screen title="Account">
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{me?.profile.name}</T>
          {isVaultOwner && (
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
      {isVaultOwner && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700" size={16}>Manage Partner Account</T>
            <View style={{ backgroundColor: c.accent + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <T size={11} weight="600" color={c.accent}>Admin Only</T>
            </View>
          </View>
          <T size={13} muted>
            Create an account for your partner. They will receive a code to choose their own password.
          </T>
          {me?.partner && (
            <View style={{ backgroundColor: c.cardAlt, padding: 12, borderRadius: 10, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <T size={13} weight="600">Currently Linked Partner: <T color={c.accent}>{me.partner.name}</T></T>
                  {me.partner.email ? <T size={12} muted>{me.partner.email}</T> : null}
                </View>
                <Pressable
                  onPress={handleUnlinkPartner}
                  disabled={pBusy}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: c.danger + '20',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    opacity: pressed || pBusy ? 0.6 : 1,
                  })}>
                  <Ionicons name="person-remove-outline" size={16} color={c.danger} />
                  <T size={12} weight="700" color={c.danger}>Unlink</T>
                </Pressable>
              </View>
            </View>
          )}
          <Input label="Partner Name" placeholder="e.g. Partner Name" value={pName} onChangeText={setPName} />
          <Input label="Partner Email" placeholder="partner@email.com" keyboardType="email-address" autoCapitalize="none" value={pEmail} onChangeText={setPEmail} />
          {pSuccess && <T size={13} color={c.accent} weight="600">{pSuccess}</T>}
          <ErrorText msg={pErr} />
          <Button label={pBusy ? 'Saving...' : 'Create & Link Partner'} onPress={handleSavePartner} loading={pBusy} />
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
            {!isVaultOwner && <T size={12} muted>Managed by {me?.partner?.name ?? 'the vault owner'}</T>}
          </View>
          <Input label={`Savings goal (${v.currency})`} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" editable={isVaultOwner} />
          <Input label="Monthly target for both of you" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={isVaultOwner} />
          
          <View style={{ gap: 6 }}>
            <T size={12} muted weight="600">Reminder day of the month (1 to 28)</T>
            <T size={11} muted>Both partners will see the savings alert notification on their dashboard on this day.</T>
            {isVaultOwner && (
              <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
                {[1, 5, 15, 20, 25, 28].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDay(String(d))}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: day === String(d) ? c.accent : c.cardAlt,
                    }}>
                    <T size={11} weight="700" color={day === String(d) ? c.onAccent : c.text}>{d}</T>
                  </Pressable>
                ))}
              </View>
            )}
            <Input value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} editable={isVaultOwner} placeholder="e.g. 28" />
          </View>

          <ErrorText msg={err} />
          {isVaultOwner ? (
            <Button label="Save plan" onPress={saveSettings} />
          ) : (
            <T size={12} muted style={{ textAlign: 'center' }}>Only the vault owner can edit the savings plan</T>
          )}
          <Button label="Send reminder now" variant="ghost" onPress={remindNow} />
        </Card>
      )}

      <Button label="Log out" variant="danger" onPress={confirmSignOut} />

      {/* Modern Confirmation Popup */}
      <ConfirmModal
        visible={confirmConfig.visible}
        title={confirmConfig.title}
        message={confirmConfig.message}
        icon={confirmConfig.icon}
        confirmLabel={confirmConfig.confirmLabel}
        isDestructive={confirmConfig.isDestructive}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, visible: false }))}
      />

      {/* Modern Status/Alert Popup */}
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
