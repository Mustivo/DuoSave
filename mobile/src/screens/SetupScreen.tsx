import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorText, Input, Screen, T } from '../ui';

export default function SetupScreen() {
  const { refreshMe, signOut } = useAuth();
  const [name, setName] = useState('Our Vault'); const [cur, setCur] = useState('USD');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); await refreshMe(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Screen title="Set up your vault">
      <Card>
        <T weight="700" size={16}>Start a new vault</T>
        <T muted size={13}>You will get a code to send to your partner.</T>
        <Input label="Vault name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input label="Currency (3 letters)" value={cur} onChangeText={(v) => setCur(v.toUpperCase())} maxLength={3} />
        <Button label="Create vault" loading={busy} onPress={() => run(() => api.post('/vault', { name, currency: cur }))} />
      </Card>
      <Card>
        <T weight="700" size={16}>Join your partner</T>
        <Input label="Invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="DUO-XXXX-X" />
        <Button label="Join vault" variant="ghost" loading={busy} onPress={() => run(() => api.post('/vault/join', { code }))} />
      </Card>
      <ErrorText msg={err} />
      <Button label="Log out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
