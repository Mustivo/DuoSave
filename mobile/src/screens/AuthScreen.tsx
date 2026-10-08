import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { api } from '../api';
import { Button, ErrorText, Input, T } from '../ui';

export default function AuthScreen() {
  const { c } = useTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (mode === 'register' && !name.trim()) { setErr('Please enter your name'); return; }
    if (!email.trim()) { setErr('Please enter your email'); return; }
    if (mode !== 'forgot' && (!pw || pw.length < 6)) { setErr('Password must be at least 6 characters'); return; }

    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === 'forgot') {
        await api.post('/auth/forgot-password', { email: email.trim() });
        setMsg('Password reset link sent! Please check your email.');
      } else if (mode === 'register') {
        await signUp(name.trim(), email.trim(), pw);
      } else {
        await signIn(email.trim(), pw);
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={{ gap: 4, marginTop: 20, marginBottom: 8 }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 68, height: 68, borderRadius: 16 }} />
            <T size={32} weight="800">DuoSave</T>
            <T muted>
              {mode === 'forgot'
                ? 'Enter your email to receive a password reset link.'
                : 'Save smarter, together. Built for two.'}
            </T>
          </View>

          {mode === 'register' && (
            <Input label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
          )}

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {mode !== 'forgot' && (
            <View style={{ gap: 6 }}>
              <Input
                label="Password"
                value={pw}
                onChangeText={setPw}
                secureTextEntry={!showPw}
                rightElement={
                  <Pressable onPress={() => setShowPw(!showPw)} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
                  </Pressable>
                }
              />
              {mode === 'login' && (
                <Pressable
                  onPress={() => { setMode('forgot'); setErr(null); setMsg(null); }}
                  style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
                  <T size={13} color={c.accent} weight="600">Forgot password?</T>
                </Pressable>
              )}
            </View>
          )}

          {msg && <T size={13} color={c.accent} weight="600">{msg}</T>}
          <ErrorText msg={err} />

          <Button
            label={mode === 'forgot' ? 'Send reset link' : mode === 'register' ? 'Create account' : 'Log in'}
            onPress={submit}
            loading={busy}
          />

          {mode === 'forgot' ? (
            <Button
              label="Back to log in"
              variant="ghost"
              onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
            />
          ) : (
            <Button
              label={mode === 'register' ? 'I already have an account' : 'Create a new account'}
              variant="ghost"
              onPress={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setErr(null);
                setMsg(null);
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
