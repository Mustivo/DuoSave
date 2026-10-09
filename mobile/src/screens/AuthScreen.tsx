import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { api } from '../api';
import { Button, ErrorText, Input, T } from '../ui';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset-otp';

export default function AuthScreen() {
  const { c } = useTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [otp, setOtp] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('duo_last_email').then((saved) => {
      if (saved && !email) setEmail(saved);
    }).catch(() => {});
  }, []);

  const sendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErr('Please enter a valid email address');
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setMode('reset-otp');
      setMsg(`A verification code was sent to ${email.trim()}. Enter it below with your new password.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitResetOtp = async () => {
    if (!otp.trim()) { setErr('Please enter the verification code'); return; }
    if (!pw || pw.length < 6) { setErr('New password must be at least 6 characters'); return; }
    if (pw !== confirmPw) { setErr('Passwords do not match'); return; }

    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        otp: otp.trim(),
        newPassword: pw,
      });
      setMode('login');
      setPw('');
      setConfirmPw('');
      setOtp('');
      setMsg('Password updated successfully! You can now log in.');
      Alert.alert('Password Reset', 'Your password has been updated. Please sign in.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (mode === 'forgot') {
      await sendOtp();
      return;
    }
    if (mode === 'reset-otp') {
      await submitResetOtp();
      return;
    }

    if (mode === 'register' && !name.trim()) { setErr('Please enter your name'); return; }
    if (!email.trim()) { setErr('Please enter your email'); return; }
    if (!pw || pw.length < 6) { setErr('Password must be at least 6 characters'); return; }

    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === 'register') {
        await signUp(name.trim(), email.trim(), pw);
        SecureStore.setItemAsync('duo_last_email', email.trim()).catch(() => {});
      } else {
        await signIn(email.trim(), pw);
        SecureStore.setItemAsync('duo_last_email', email.trim()).catch(() => {});
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
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
                ? 'Enter your email to receive a password reset verification code.'
                : mode === 'reset-otp'
                ? 'Enter the code sent to your email to set a new password.'
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
            editable={mode !== 'reset-otp'}
          />

          {mode === 'reset-otp' && (
            <Input
              label="Verification Code (OTP from email)"
              placeholder="e.g. 123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={10}
            />
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset-otp') && (
            <View style={{ gap: 6 }}>
              <Input
                label={mode === 'reset-otp' ? 'New Password' : 'Password'}
                placeholder={mode === 'reset-otp' ? 'Enter new password (min 6 chars)' : undefined}
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

          {mode === 'reset-otp' && (
            <Input
              label="Confirm New Password"
              placeholder="Re-enter new password"
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showPw}
            />
          )}

          {msg && (
            <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
              <T size={13} color={c.accent} weight="600">{msg}</T>
            </View>
          )}
          <ErrorText msg={err} />

          <Button
            label={
              mode === 'forgot'
                ? 'Send verification code'
                : mode === 'reset-otp'
                ? 'Confirm & Reset Password'
                : mode === 'register'
                ? 'Create account'
                : 'Log in'
            }
            onPress={submit}
            loading={busy}
          />

          {mode === 'reset-otp' && (
            <Button
              label="Resend verification code"
              variant="ghost"
              onPress={sendOtp}
              loading={busy}
            />
          )}

          {mode === 'forgot' || mode === 'reset-otp' ? (
            <Button
              label="Back to log in"
              variant="ghost"
              onPress={() => { setMode('login'); setErr(null); setMsg(null); setOtp(''); setConfirmPw(''); }}
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
