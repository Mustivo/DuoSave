import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { Mode, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { Profile } from '../types';
import { Button, Card, ConfirmModal, CopyrightFooter, ErrorText, Input, Screen, StatusModal, T } from '../ui';

const MASTER_ADMIN_EMAIL = 'stevenmwizerwa1@gmail.com';

type SystemUser = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  isLinkedToMyVault: boolean;
  isLinkedToAnyVault: boolean;
  currentVaultId: string | null;
  currentVaultName: string | null;
};

export default function AccountScreen() {
  const { c, mode, setMode } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { me, refreshMe, signOut } = useAuth();
  const v = me?.vault;

  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('');
  const [day, setDay] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Partner account creation state
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pPassword, setPPassword] = useState('');
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [pSuccess, setPSuccess] = useState<string | null>(null);

  // System Partner Directory state
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);

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

  const isMasterAdmin = me?.profile?.email?.toLowerCase() === MASTER_ADMIN_EMAIL;

  const loadDirectory = async () => {
    if (!isMasterAdmin) return;
    setLoadingDir(true);
    try {
      const res = await api.get<{ ok: boolean; users: SystemUser[] }>('/vault/admin/directory');
      setSystemUsers(res.users ?? []);
    } catch (e: any) {
      console.warn('Directory fetch error:', e?.message);
    } finally {
      setLoadingDir(false);
    }
  };

  useEffect(() => {
    if (!v) return;
    setGoal(String(v.savings_goal));
    setTarget(String(v.monthly_target));
    setDay(String(v.reminder_day));
  }, [v?.id]);

  useEffect(() => {
    if (isMasterAdmin) {
      loadDirectory();
    }
  }, [isMasterAdmin]);

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
        message: 'A savings notification was sent to all linked partner accounts.',
        type: 'success',
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSavePartner = async () => {
    if (!pName.trim()) { setPErr('Enter the partner name'); return; }
    if (!pEmail.trim() || !pEmail.includes('@')) { setPErr('Enter a valid email address'); return; }
    if (pPassword && pPassword.length < 6) { setPErr('Password must be at least 6 characters'); return; }

    setPErr(null);
    setPSuccess(null);
    setPBusy(true);
    try {
      const res = await api.post<{ ok: boolean; partner: { id: string; name: string; email: string } }>('/vault/partner', {
        name: pName.trim(),
        email: pEmail.trim().toLowerCase(),
        password: pPassword.trim() || undefined,
      });
      setPName('');
      setPEmail('');
      setPPassword('');
      setPSuccess(`Partner ${res.partner.name} (${res.partner.email}) was created and linked.`);
      setStatusConfig({
        visible: true,
        title: 'Partner Created & Linked',
        message: `Account for ${res.partner.name} (${res.partner.email}) was successfully created and linked to your vault.${pPassword ? ' They can now log in using the assigned password.' : ' A password setup code was emailed to them.'}`,
        type: 'success',
      });
      await Promise.all([refreshMe(), loadDirectory()]);
    } catch (e: any) {
      setPErr(e.message);
    } finally {
      setPBusy(false);
    }
  };

  const handleLinkFromDirectory = (user: SystemUser) => {
    if (user.isLinkedToAnyVault) {
      setStatusConfig({
        visible: true,
        title: 'Already Linked',
        message: `${user.name} is already linked to another account in the system and cannot be linked.`,
        type: 'error',
      });
      return;
    }

    setConfirmConfig({
      visible: true,
      title: 'Link Partner to Vault?',
      message: `Do you want to link ${user.name} (${user.email}) to this shared vault? They will be able to save, borrow, and view shared balances.`,
      icon: 'link-outline',
      confirmLabel: 'Link Partner',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setPBusy(true);
        try {
          await api.post('/vault/admin/link', { userId: user.id });
          await Promise.all([refreshMe(), loadDirectory()]);
          setStatusConfig({
            visible: true,
            title: 'Partner Linked',
            message: `${user.name} is now linked to your vault!`,
            type: 'success',
          });
        } catch (e: any) {
          setStatusConfig({
            visible: true,
            title: 'Linking Error',
            message: e.message,
            type: 'error',
          });
        } finally {
          setPBusy(false);
        }
      },
    });
  };

  const handleDeletePartner = (partnerToDelete: { id: string; name: string; email?: string }) => {
    setConfirmConfig({
      visible: true,
      title: t('delete_partner_title'),
      message: t('delete_partner_msg', { name: partnerToDelete.name }),
      icon: 'trash-outline',
      confirmLabel: t('delete_partner'),
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setPBusy(true);
        setPErr(null);
        try {
          await api.delete(`/vault/partner/${partnerToDelete.id}`);
          await Promise.all([refreshMe(), loadDirectory()]);
          setStatusConfig({
            visible: true,
            title: t('delete_partner'),
            message: t('delete_partner_success', { name: partnerToDelete.name }),
            type: 'info',
          });
        } catch (e: any) {
          setStatusConfig({
            visible: true,
            title: t('error'),
            message: e.message || 'Could not delete partner',
            type: 'error',
          });
        } finally {
          setPBusy(false);
        }
      },
    });
  };

  const confirmSignOut = () => {
    setConfirmConfig({
      visible: true,
      title: `${t('log_out')}?`,
      message: t('log_out_confirm'),
      icon: 'log-out-outline',
      confirmLabel: t('log_out'),
      isDestructive: true,
      onConfirm: () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        signOut();
      },
    });
  };

  const partnersList = me?.partners && me.partners.length > 0 ? me.partners : (me?.partner ? [me.partner] : []);

  return (
    <Screen title={t('account_title')}>
      {/* Profile Card */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{me?.profile.name}</T>
          {isMasterAdmin && (
            <View style={{ backgroundColor: c.accent + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <T size={12} weight="700" color={c.accent}>👑 Master Administrator</T>
            </View>
          )}
        </View>
        {me?.profile?.email && <T muted size={13}>{me.profile.email}</T>}
        <T muted size={13}>
          {partnersList.length > 0
            ? `Vault Partners (${partnersList.length}): ${partnersList.map((p) => p.name).join(', ')}`
            : 'No partners linked yet'}
        </T>
        {v && <T size={13} muted>Vault Invite Code: <T weight="700" color={c.accent}>{v.invite_code}</T></T>}
      </Card>

      {/* Dedicated Vault Partners Card with Delete Partner Button */}
      {v && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="people-outline" size={20} color={c.accent} />
              <T weight="700" size={16}>{t('vault_partners')} ({partnersList.length})</T>
            </View>
          </View>

          {partnersList.length === 0 ? (
            <T muted size={13}>{t('no_partners')}</T>
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              {partnersList.map((p) => (
                <View
                  key={p.id}
                  style={{
                    backgroundColor: c.cardAlt,
                    padding: 12,
                    borderRadius: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: c.border,
                  }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="person-circle-outline" size={22} color={c.accent} />
                      <T size={14} weight="700">{p.name}</T>
                    </View>
                    {p.email && <T size={12} muted>{p.email}</T>}
                  </View>

                  {isMasterAdmin && (
                    <Pressable
                      onPress={() => handleDeletePartner(p)}
                      disabled={pBusy}
                      hitSlop={8}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: c.danger + '20',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: c.danger + '40',
                        opacity: pressed || pBusy ? 0.6 : 1,
                      })}>
                      <Ionicons name="trash-outline" size={13} color={c.danger} />
                      <T size={12} weight="700" color={c.danger}>{t('delete_partner')}</T>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {/* MASTER ADMIN PORTAL */}
      {isMasterAdmin && (
        <>
          {/* Guide Card: How Partner Linking Works */}
          <Card style={{ borderColor: c.accent, borderWidth: 1.5, backgroundColor: c.accent + '0D' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="information-circle" size={22} color={c.accent} />
              <T weight="700" size={16} color={c.accent}>How Partner Linking Works</T>
            </View>
            <View style={{ gap: 6, marginTop: 4 }}>
              <T size={13}>
                <T weight="700">1. Link from System Directory:</T> Any registered partner in the system is listed below. Tap <T weight="700" color={c.accent}>"Link to Vault"</T> to connect them with 1 tap.
              </T>
              <T size={13}>
                <T weight="700">2. Link with Invite Code:</T> Share your invite code <T weight="700" color={c.accent}>({v?.invite_code})</T> with a partner. They can enter it to join.
              </T>
              <T size={13}>
                <T weight="700">3. Create New Account:</T> Enter a partner's name and email in the creation form below. They will immediately receive an email OTP to choose their password.
              </T>
            </View>
          </Card>

          {/* System Directory: All Partners Across the System */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="people" size={20} color={c.accent} />
                <T weight="700" size={16}>All System Partners ({systemUsers.length})</T>
              </View>
              <Pressable onPress={loadDirectory} disabled={loadingDir} hitSlop={8} style={{ padding: 4 }}>
                {loadingDir ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Ionicons name="refresh" size={18} color={c.accent} />
                )}
              </Pressable>
            </View>

            <T size={12} muted>
              Every user account registered in the DuoSave database and their current linking status:
            </T>

            {loadingDir && systemUsers.length === 0 ? (
              <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} />
            ) : systemUsers.length === 0 ? (
              <T size={13} muted style={{ textAlign: 'center', paddingVertical: 10 }}>No other registered partners found in system.</T>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {systemUsers.map((user) => (
                  <View
                    key={user.id}
                    style={{
                      backgroundColor: c.cardAlt,
                      padding: 12,
                      borderRadius: 12,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderWidth: user.isLinkedToMyVault ? 1 : 0,
                      borderColor: user.isLinkedToMyVault ? c.accent + '40' : 'transparent',
                    }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="person-circle-outline" size={20} color={user.isLinkedToMyVault ? c.accent : c.muted} />
                        <T size={14} weight="700">{user.name}</T>
                      </View>
                      <T size={12} muted>{user.email}</T>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <View style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: user.isLinkedToMyVault ? c.accent : user.isLinkedToAnyVault ? c.blue : c.warn,
                        }} />
                        <T size={11} color={user.isLinkedToMyVault ? c.accent : user.isLinkedToAnyVault ? c.blue : c.warn} weight="600">
                          {user.isLinkedToMyVault
                            ? 'Linked to this Vault'
                            : user.isLinkedToAnyVault
                            ? `In ${user.currentVaultName}`
                            : 'Unlinked / Available'}
                        </T>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {user.isLinkedToMyVault ? (
                        <Pressable
                          onPress={() => handleDeletePartner(user)}
                          disabled={pBusy}
                          hitSlop={8}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: c.danger + '20',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: c.danger + '40',
                            opacity: pressed || pBusy ? 0.6 : 1,
                          })}>
                          <Ionicons name="trash-outline" size={13} color={c.danger} />
                          <T size={12} weight="700" color={c.danger}>{t('delete_partner')}</T>
                        </Pressable>
                      ) : user.isLinkedToAnyVault ? (
                        <>
                          <View style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: c.card,
                            borderWidth: 1,
                            borderColor: c.border,
                          }}>
                            <T size={11} weight="600" muted>{t('already_linked')}</T>
                          </View>
                          <Pressable
                            onPress={() => handleDeletePartner(user)}
                            disabled={pBusy}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              backgroundColor: c.danger + '20',
                              padding: 7,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: c.danger + '40',
                              opacity: pressed || pBusy ? 0.6 : 1,
                            })}>
                            <Ionicons name="trash-outline" size={14} color={c.danger} />
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable
                            onPress={() => handleLinkFromDirectory(user)}
                            disabled={pBusy}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              backgroundColor: c.accent + '20',
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 8,
                              opacity: pressed || pBusy ? 0.6 : 1,
                            })}>
                            <T size={12} weight="700" color={c.accent}>{t('link_to_vault')}</T>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeletePartner(user)}
                            disabled={pBusy}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              backgroundColor: c.danger + '20',
                              padding: 7,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: c.danger + '40',
                              opacity: pressed || pBusy ? 0.6 : 1,
                            })}>
                            <Ionicons name="trash-outline" size={14} color={c.danger} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Create & Link Brand New Partner Account */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T weight="700" size={16}>{t('create_new_partner')}</T>
              <View style={{ backgroundColor: c.accent + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <T size={11} weight="600" color={c.accent}>Admin Only</T>
              </View>
            </View>
            <T size={13} muted>
              {t('create_partner_desc')}
            </T>

            <Input label="Partner Name" placeholder="e.g. Marie" value={pName} onChangeText={setPName} />
            <Input label="Partner Email" placeholder="marie@email.com" keyboardType="email-address" autoCapitalize="none" value={pEmail} onChangeText={setPEmail} />
            <Input label={t('partner_password_placeholder')} placeholder="Min 6 characters (or empty for OTP)" secureTextEntry value={pPassword} onChangeText={setPPassword} />
            {pSuccess && <T size={13} color={c.accent} weight="600">{pSuccess}</T>}
            <ErrorText msg={pErr} />
            <Button label={pBusy ? 'Saving...' : `+ ${t('create_new_partner')}`} onPress={handleSavePartner} loading={pBusy} />
          </Card>
        </>
      )}

      {/* Language Settings */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="globe-outline" size={20} color={c.accent} />
          <T weight="700" size={16}>{t('language')}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setLang('en')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: lang === 'en' ? c.accent : c.cardAlt,
            }}>
            <T weight="700" color={lang === 'en' ? c.onAccent : c.text}>English</T>
          </Pressable>
          <Pressable
            onPress={() => setLang('rw')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: lang === 'rw' ? c.accent : c.cardAlt,
            }}>
            <T weight="700" color={lang === 'rw' ? c.onAccent : c.text}>Ikinyarwanda</T>
          </Pressable>
        </View>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <T weight="700" size={16}>{t('appearance')}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
              backgroundColor: mode === m ? c.accent : c.cardAlt,
            }}>
              <T weight="600" color={mode === m ? c.onAccent : c.text}>
                {m === 'system' ? t('system') : m === 'light' ? t('light') : t('dark')}
              </T>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Savings Plan (Admin Editable) */}
      {v && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700" size={16}>{t('savings_plan')}</T>
            {!isMasterAdmin && <T size={12} muted>Managed by {MASTER_ADMIN_EMAIL}</T>}
          </View>
          <Input label={`${t('savings_goal')} (${v.currency})`} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" editable={isMasterAdmin} />
          <Input label={t('monthly_target')} value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={isMasterAdmin} />
          
          <View style={{ gap: 6 }}>
            <T size={12} muted weight="600">{t('reminder_day_label')}</T>
            <T size={11} muted>{t('reminder_day_desc')}</T>
            {isMasterAdmin && (
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
            <Input value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} editable={isMasterAdmin} placeholder="e.g. 28" />
          </View>

          <ErrorText msg={err} />
          {isMasterAdmin ? (
            <Button label={t('save_plan')} onPress={saveSettings} />
          ) : (
            <T size={12} muted style={{ textAlign: 'center' }}>Only master admin ({MASTER_ADMIN_EMAIL}) can edit the savings plan</T>
          )}
          <Button label={t('send_reminder_now')} variant="ghost" onPress={remindNow} />
        </Card>
      )}

      <Button label={t('log_out')} variant="danger" onPress={confirmSignOut} />

      <CopyrightFooter />

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
