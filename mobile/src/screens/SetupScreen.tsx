import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';
import { Button, Card, ErrorText, Input, Screen, T } from '../ui';

export default function SetupScreen() {
  const { me, refreshMe, signOut } = useAuth();
  const { t } = useLanguage();
  const isMasterAdmin = me?.profile?.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com';
  const [name, setName] = useState('Our Savings');
  const [cur, setCur] = useState('RWF');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refreshMe();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <Screen title={t('setup_title')} onRefresh={refreshMe}>
      {isMasterAdmin && (
        <Card>
          <T weight="700" size={16}>{t('start_new_vault')}</T>
          <T muted size={13}>{t('start_new_vault_desc')}</T>
          <Input label={t('vault_name')} value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label={t('currency_label')} value={cur} onChangeText={(v) => setCur(v.toUpperCase())} maxLength={3} />
          <Button label={t('create_vault')} loading={busy} onPress={() => run(() => api.post('/vault', { name, currency: cur }))} />
        </Card>
      )}
      <Card>
        <T weight="700" size={16}>{t('join_partner')}</T>
        <T muted size={13}>Enter the vault invite code to connect with your partner.</T>
        <Input label={t('invite_code_label')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="DUO-XXXX-X" />
        <Button label={t('join_vault')} variant="primary" loading={busy} onPress={() => run(() => api.post('/vault/join', { code }))} />
      </Card>
      <ErrorText msg={err} />
      <Button label={t('log_out')} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
