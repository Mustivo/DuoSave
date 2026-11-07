import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { api } from '../api';
import { Button, Card, CopyrightFooter, ErrorText, Input, T } from '../ui';

type AuthMode = 'login' | 'forgot-choice' | 'enter-code' | 'request-code';

export default function AuthScreen() {
  const { c, isDark } = useTheme();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
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
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setMode('enter-code');
      setMsg(`Verification code sent to ${email.trim()}. Enter it below with your new password.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitResetOtp = async () => {
    if (!email.trim() || !email.includes('@')) { setErr('Please enter your email'); return; }
    if (!otp.trim()) { setErr('Please enter the verification code'); return; }
    if (!pw || pw.length < 6) { setErr('New password must be at least 6 characters'); return; }
    if (pw !== confirmPw) { setErr('Passwords do not match'); return; }

    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword: pw,
      });
      setMode('login');
      setPw('');
      setConfirmPw('');
      setOtp('');
      setMsg('Password updated successfully! You can now log in.');
      Alert.alert('Password Updated', 'Your new password is set. Please sign in.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    if (!email.trim()) { setErr('Please enter your email'); return; }
    if (!pw) { setErr('Please enter your password'); return; }

    setBusy(true); setErr(null); setMsg(null);
    try {
      await signIn(email.trim().toLowerCase(), pw);
      SecureStore.setItemAsync('duo_last_email', email.trim().toLowerCase()).catch(() => {});
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Centered Logo Header */}
          <View style={{ gap: 8, marginTop: 20, marginBottom: 16, alignItems: 'center' }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} />
            <T size={32} weight="800" style={{ textAlign: 'center' }}>DuoSave</T>
            <T muted style={{ textAlign: 'center', maxWidth: 300 }}>
              {mode === 'login' && 'Sign in to access your shared savings vault.'}
              {mode === 'forgot-choice' && 'Choose an option to verify your code or reset your password.'}
              {mode === 'enter-code' && 'Enter the verification code from your email and set your password.'}
              {mode === 'request-code' && 'Enter your email to receive a password reset code.'}
            </T>
          </View>

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
            <>
              <Input
                label="Email"
                placeholder="your-email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={{ gap: 6 }}>
                <Input
                  label="Password"
                  placeholder="Enter password"
                  value={pw}
                  onChangeText={setPw}
                  secureTextEntry={!showPw}
                  rightElement={
                    <Pressable onPress={() => setShowPw(!showPw)} hitSlop={10} style={{ padding: 4 }}>
                      <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
                    </Pressable>
                  }
                />
                <Pressable
                  onPress={() => { setMode('forgot-choice'); setErr(null); setMsg(null); }}
                  style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
                  <T size={13} color={c.accent} weight="600">Forgot password / First-time setup?</T>
                </Pressable>
              </View>

              {msg && (
                <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
                  <T size={13} color={c.accent} weight="600">{msg}</T>
                </View>
              )}
              <ErrorText msg={err} />

              <Button label="Sign In" onPress={submitLogin} loading={busy} />
            </>
          )}

          {/* MODE 2: FORGOT CHOICES (TWO DISTINCT ACTIONS) */}
          {mode === 'forgot-choice' && (
            <View style={{ gap: 12 }}>
              {/* Option 1: Use Verification Code */}
              <Pressable
                onPress={() => { setMode('enter-code'); setErr(null); setMsg(null); }}
                style={({ pressed }) => ({
                  backgroundColor: c.card,
                  borderColor: c.accent,
                  borderWidth: 1.5,
                  borderRadius: 16,
                  padding: 16,
                  gap: 8,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ backgroundColor: c.accent + '20', padding: 10, borderRadius: 10 }}>
                    <Ionicons name="key-outline" size={24} color={c.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="700" size={16} color={c.accent}>1. Use Verification Code</T>
                    <T size={12} muted>For newly linked partners with an invite code from the admin, or if you already have an OTP.</T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <T size={13} weight="700" color={c.accent}>Enter Code & Set Password</T>
                  <Ionicons name="arrow-forward" size={16} color={c.accent} />
                </View>
              </Pressable>

              {/* Option 2: Request New Reset Code */}
              <Pressable
                onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
                style={({ pressed }) => ({
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 16,
                  gap: 8,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ backgroundColor: c.cardAlt, padding: 10, borderRadius: 10 }}>
                    <Ionicons name="mail-unread-outline" size={24} color={c.blue} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="700" size={16}>2. Send Reset Code to Email</T>
                    <T size={12} muted>For existing linked members who forgot their password and need a new code sent.</T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <T size={13} weight="700" color={c.blue}>Request New Code</T>
                  <Ionicons name="arrow-forward" size={16} color={c.blue} />
                </View>
              </Pressable>

              <Button
                label="← Back to Sign In"
                variant="ghost"
                onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
              />
            </View>
          )}

          {/* MODE 3: ENTER VERIFICATION CODE & SET NEW PASSWORD */}
          {mode === 'enter-code' && (
            <>
              <Input
                label="Email"
                placeholder="your-email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Input
                label="Verification Code (OTP from email)"
                placeholder="e.g. 123456"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={10}
              />

              <Input
                label="New Password"
                placeholder="Enter new password (min 6 chars)"
                value={pw}
                onChangeText={setPw}
                secureTextEntry={!showPw}
                rightElement={
                  <Pressable onPress={() => setShowPw(!showPw)} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
                  </Pressable>
                }
              />

              <Input
                label="Confirm New Password"
                placeholder="Re-enter new password"
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry={!showPw}
              />

              {msg && (
                <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
                  <T size={13} color={c.accent} weight="600">{msg}</T>
                </View>
              )}
              <ErrorText msg={err} />

              <Button label="Confirm & Set Password" onPress={submitResetOtp} loading={busy} />

              <Button
                label="Need a code? Send reset code"
                variant="ghost"
                onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label="← Back to choices"
                variant="ghost"
                onPress={() => { setMode('forgot-choice'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          {/* MODE 4: REQUEST NEW RESET CODE */}
          {mode === 'request-code' && (
            <>
              <Input
                label="Your Email"
                placeholder="your-email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {msg && (
                <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
                  <T size={13} color={c.accent} weight="600">{msg}</T>
                </View>
              )}
              <ErrorText msg={err} />

              <Button label="Send Reset Code" onPress={sendOtp} loading={busy} />

              <Button
                label="Already have a code? Enter it here"
                variant="ghost"
                onPress={() => { setMode('enter-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label="← Back to choices"
                variant="ghost"
                onPress={() => { setMode('forgot-choice'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          <CopyrightFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
