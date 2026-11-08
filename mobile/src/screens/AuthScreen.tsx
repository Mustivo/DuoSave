import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { api } from '../api';
import { Button, CopyrightFooter, ErrorText, Input, StatusModal, T } from '../ui';

type AuthMode = 'login' | 'forgot-choice' | 'verify-code' | 'set-password' | 'request-code';

export default function AuthScreen() {
  const { c, isDark } = useTheme();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusConfig, setStatusConfig] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({ visible: false, type: 'info', title: '', message: '' });

  useEffect(() => {
    SecureStore.getItemAsync('duo_last_email').then((saved) => {
      if (saved && !email) setEmail(saved);
    }).catch(() => {});
  }, []);

  const sendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErr('Enter your email');
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErr('Enter a valid email');
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/forgot-password', { email: trimmedEmail.toLowerCase() });
      setMode('verify-code');
      setMsg(`Code sent to ${trimmedEmail}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerifyCode = async () => {
    const trimmedOtp = otp.trim();
    if (!trimmedOtp) {
      setErr('Enter verification code');
      return;
    }
    if (trimmedOtp.length < 4) {
      setErr('Enter complete code');
      return;
    }

    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; userId: string; email?: string }>('/auth/verify-code', {
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        otp: trimmedOtp,
      });
      setVerifiedUserId(res.userId);
      if (res.email) setEmail(res.email);
      setMode('set-password');
      setMsg('Code confirmed. Enter your new password.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitSetPassword = async () => {
    if (!pw) {
      setErr('Enter new password');
      return;
    }
    if (pw.length < 6) {
      setErr('Password must be at least 6 characters');
      return;
    }
    if (!confirmPw) {
      setErr('Confirm your password');
      return;
    }
    if (pw !== confirmPw) {
      setErr('Passwords do not match');
      return;
    }

    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/set-password', {
        userId: verifiedUserId ?? undefined,
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword: pw,
      });
      setMode('login');
      setPw('');
      setConfirmPw('');
      setOtp('');
      setVerifiedUserId(null);
      setMsg('Password updated. You can now sign in.');
      setStatusConfig({
        visible: true,
        type: 'success',
        title: 'Password Updated',
        message: 'Your new password has been set. You can now sign in.',
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErr('Enter your email');
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErr('Enter a valid email');
      return;
    }
    if (!pw) {
      setErr('Enter your password');
      return;
    }
    if (pw.length < 6) {
      setErr('Password must be at least 6 characters');
      return;
    }

    setBusy(true); setErr(null); setMsg(null);
    try {
      await signIn(trimmedEmail.toLowerCase(), pw);
      SecureStore.setItemAsync('duo_last_email', trimmedEmail.toLowerCase()).catch(() => {});
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
              {mode === 'verify-code' && 'Enter the verification code received when your partner linked you.'}
              {mode === 'set-password' && 'Step 2: Create your new password.'}
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

          {/* MODE 2: FORGOT CHOICES (TWO DISTINCT ACTIONS, NO ARROWS) */}
          {mode === 'forgot-choice' && (
            <View style={{ gap: 12 }}>
              {/* Option 1: Use Verification Code */}
              <Pressable
                onPress={() => { setMode('verify-code'); setErr(null); setMsg(null); }}
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
                    <T size={12} muted>Enter the verification code you received when your partner linked you.</T>
                  </View>
                </View>
                <View style={{ marginTop: 6 }}>
                  <Button
                    label="Enter Verification Code"
                    variant="primary"
                    onPress={() => { setMode('verify-code'); setErr(null); setMsg(null); }}
                  />
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
                <View style={{ marginTop: 6 }}>
                  <Button
                    label="Send Reset Code to Email"
                    variant="ghost"
                    onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
                  />
                </View>
              </Pressable>

              <Button
                label="Back to Sign In"
                variant="ghost"
                onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
              />
            </View>
          )}

          {/* MODE 3: STEP 1 - ENTER VERIFICATION CODE ONLY */}
          {mode === 'verify-code' && (
            <>
              <Input
                label="Verification Code"
                placeholder="Enter 6-digit code from email"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={10}
              />

              {msg && (
                <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
                  <T size={13} color={c.accent} weight="600">{msg}</T>
                </View>
              )}
              <ErrorText msg={err} />

              <Button label="Verify Code" onPress={submitVerifyCode} loading={busy} />

              <Button
                label="Need a code? Send reset code"
                variant="ghost"
                onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label="Back to Options"
                variant="ghost"
                onPress={() => { setMode('forgot-choice'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          {/* MODE 4: STEP 2 - ENTER NEW PASSWORD AFTER CODE IS CONFIRMED */}
          {mode === 'set-password' && (
            <>
              <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={18} color={c.accent} />
                  <T size={13} weight="700" color={c.accent}>Verification Confirmed</T>
                </View>
                <T size={12}>
                  Code successfully verified{email ? ` for ${email}` : ''}. Please choose your new password.
                </T>
              </View>

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

              <ErrorText msg={err} />

              <Button label="Save New Password" onPress={submitSetPassword} loading={busy} />

              <Button
                label="Back to Sign In"
                variant="ghost"
                onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          {/* MODE 5: REQUEST NEW RESET CODE */}
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
                onPress={() => { setMode('verify-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label="Back to Options"
                variant="ghost"
                onPress={() => { setMode('forgot-choice'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          <CopyrightFooter />
        </ScrollView>
      </KeyboardAvoidingView>

      <StatusModal
        visible={statusConfig.visible}
        type={statusConfig.type}
        title={statusConfig.title}
        message={statusConfig.message}
        onClose={() => setStatusConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}
