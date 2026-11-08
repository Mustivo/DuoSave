import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { api } from '../api';
import { Button, CopyrightFooter, ErrorText, Input, StatusModal, T } from '../ui';

type AuthMode = 'login' | 'forgot-choice' | 'verify-code' | 'set-password' | 'request-code';

export default function AuthScreen() {
  const { c, isDark } = useTheme();
  const { lang, setLang, t } = useLanguage();
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
      setErr(t('enter_email'));
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErr(t('enter_valid_email'));
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.post('/auth/forgot-password', { email: trimmedEmail.toLowerCase() });
      setMode('verify-code');
      setMsg(t('code_sent_to', { email: trimmedEmail }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerifyCode = async () => {
    const trimmedOtp = otp.trim();
    if (!trimmedOtp) {
      setErr(t('enter_verification_code'));
      return;
    }
    if (trimmedOtp.length < 4) {
      setErr(t('enter_complete_code'));
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
      setMsg(t('code_confirmed_subtitle'));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitSetPassword = async () => {
    if (!pw) {
      setErr(t('enter_new_password'));
      return;
    }
    if (pw.length < 6) {
      setErr(t('password_min_length'));
      return;
    }
    if (!confirmPw) {
      setErr(t('confirm_password'));
      return;
    }
    if (pw !== confirmPw) {
      setErr(t('passwords_dont_match'));
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
      setMsg(t('password_updated_msg'));
      setStatusConfig({
        visible: true,
        type: 'success',
        title: t('password_updated_title'),
        message: t('password_updated_msg'),
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
      setErr(t('enter_email'));
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErr(t('enter_valid_email'));
      return;
    }
    if (!pw) {
      setErr(t('enter_password'));
      return;
    }
    if (pw.length < 6) {
      setErr(t('password_min_length'));
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

      {/* Top Language Toggle Switcher */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 6 }}>
        <View style={{
          flexDirection: 'row',
          backgroundColor: c.cardAlt,
          borderRadius: 20,
          padding: 3,
          borderWidth: 1,
          borderColor: c.border,
        }}>
          <Pressable
            onPress={() => setLang('en')}
            hitSlop={6}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 16,
              backgroundColor: lang === 'en' ? c.accent : 'transparent',
            }}>
            <T size={12} weight="700" color={lang === 'en' ? c.onAccent : c.muted}>EN</T>
          </Pressable>
          <Pressable
            onPress={() => setLang('rw')}
            hitSlop={6}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 16,
              backgroundColor: lang === 'rw' ? c.accent : 'transparent',
            }}>
            <T size={12} weight="700" color={lang === 'rw' ? c.onAccent : c.muted}>RW</T>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Centered Logo Header */}
          <View style={{ gap: 8, marginTop: 12, marginBottom: 16, alignItems: 'center' }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} />
            <T size={32} weight="800" style={{ textAlign: 'center' }}>DuoSave</T>
            <T muted style={{ textAlign: 'center', maxWidth: 300 }}>
              {mode === 'login' && t('sign_in_subtitle')}
              {mode === 'forgot-choice' && t('forgot_choices_subtitle')}
              {mode === 'verify-code' && t('opt_use_code_desc')}
              {mode === 'set-password' && t('step2_create_password')}
              {mode === 'request-code' && t('enter_email_to_receive')}
            </T>
          </View>

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
            <>
              <Input
                label={t('email')}
                placeholder="your-email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={{ gap: 6 }}>
                <Input
                  label={t('password')}
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
                  <T size={13} color={c.accent} weight="600">{t('forgot_password_question')}</T>
                </Pressable>
              </View>

              {msg && (
                <View style={{ backgroundColor: c.accent + '15', padding: 12, borderRadius: 10, borderColor: c.accent + '33', borderWidth: 1 }}>
                  <T size={13} color={c.accent} weight="600">{msg}</T>
                </View>
              )}
              <ErrorText msg={err} />

              <Button label={t('sign_in')} onPress={submitLogin} loading={busy} />
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
                    <T weight="700" size={16} color={c.accent}>{t('opt_use_code')}</T>
                    <T size={12} muted>{t('opt_use_code_desc')}</T>
                  </View>
                </View>
                <View style={{ marginTop: 6 }}>
                  <Button
                    label={t('opt_enter_code_btn')}
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
                    <T weight="700" size={16}>{t('opt_send_reset')}</T>
                    <T size={12} muted>{t('opt_send_reset_desc')}</T>
                  </View>
                </View>
                <View style={{ marginTop: 6 }}>
                  <Button
                    label={t('opt_send_reset_btn')}
                    variant="ghost"
                    onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
                  />
                </View>
              </Pressable>

              <Button
                label={t('back_to_sign_in')}
                variant="ghost"
                onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
              />
            </View>
          )}

          {/* MODE 3: STEP 1 - ENTER VERIFICATION CODE ONLY */}
          {mode === 'verify-code' && (
            <>
              <Input
                label={t('verification_code')}
                placeholder="Enter 6-digit code"
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

              <Button label={t('verify_code_btn')} onPress={submitVerifyCode} loading={busy} />

              <Button
                label={t('need_code_prompt')}
                variant="ghost"
                onPress={() => { setMode('request-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label={t('back_to_options')}
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
                  <T size={13} weight="700" color={c.accent}>{t('code_confirmed_title')}</T>
                </View>
                <T size={12}>
                  {t('code_confirmed_subtitle')}
                </T>
              </View>

              <Input
                label={t('new_password')}
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
                label={t('confirm_new_password')}
                placeholder="Re-enter new password"
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry={!showPw}
              />

              <ErrorText msg={err} />

              <Button label={t('save_new_password')} onPress={submitSetPassword} loading={busy} />

              <Button
                label={t('back_to_sign_in')}
                variant="ghost"
                onPress={() => { setMode('login'); setErr(null); setMsg(null); }}
              />
            </>
          )}

          {/* MODE 5: REQUEST NEW RESET CODE */}
          {mode === 'request-code' && (
            <>
              <Input
                label={t('your_email')}
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

              <Button label={t('send_reset_code')} onPress={sendOtp} loading={busy} />

              <Button
                label={t('already_have_code')}
                variant="ghost"
                onPress={() => { setMode('verify-code'); setErr(null); setMsg(null); }}
              />

              <Button
                label={t('back_to_options')}
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
