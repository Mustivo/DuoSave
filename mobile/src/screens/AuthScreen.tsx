import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Button, ErrorText, Input, T } from '../ui';

export default function AuthScreen() {
  const { c } = useTheme();
  const { signIn, signUp } = useAuth();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (register && !name.trim()) { setErr('Please enter your name'); return; }
    if (!email.trim()) { setErr('Please enter your email'); return; }
    if (!pw || pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setBusy(true); setErr(null);
    try { register ? await signUp(name.trim(), email.trim(), pw) : await signIn(email.trim(), pw); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4, marginBottom: 12 }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} />
            <T size={34} weight="800">DuoSave</T>
            <T muted>Save smarter, together. Built for two.</T>
          </View>
          {register && <Input label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />}
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Input label="Password" value={pw} onChangeText={setPw} secureTextEntry />
          <ErrorText msg={err} />
          <Button label={register ? 'Create account' : 'Log in'} onPress={submit} loading={busy} />
          <Button label={register ? 'I already have an account' : 'Create a new account'} variant="ghost" onPress={() => { setRegister(!register); setErr(null); }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
