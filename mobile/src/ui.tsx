import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleProp, Text, TextStyle,
  TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from './theme';
import { useAuth } from './auth';

export const money = (n: number, cur = 'RWF') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n); }
  catch { return `${cur} ${n.toFixed(2)}`; }
};

/** Loads data whenever the screen is focused; supports pull to refresh. */
export function useLoad<T>(fn: () => Promise<T>) {
  const ref = useRef(fn); ref.current = fn;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ref.current();
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await ref.current();
        if (active) { setData(res); setError(null); }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));
  return { data, loading, error, reload: load };
}

export function Screen({ title, children, onRefresh, refreshing }: {
  title: string; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  const { c, isDark } = useTheme();
  const { me } = useAuth();
  const partnersCount = me?.partners?.length ?? (me?.partner ? 1 : 0);
  const linked = partnersCount > 0
    ? `${me?.profile.name} • ${partnersCount} partner${partnersCount > 1 ? 's' : ''} linked`
    : 'Waiting for your partner';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}>
        <View>
          <Image source={require('../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} />
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>DuoSave</Text>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 28, marginTop: 2 }}>{title}</Text>
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{linked}</Text>
        </View>
        {children}
        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8, gap: 4 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '600' }}>© 2026 DuoSave • Built for Two</Text>
          <Text style={{ color: c.muted, fontSize: 10, opacity: 0.7 }}>Save smarter, together • All rights reserved</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 }, style]}>
      {children}
    </View>
  );
}

export function T({ children, size = 14, weight = '400', muted, color, style }: {
  children: React.ReactNode; size?: number; weight?: '400' | '600' | '700' | '800'; muted?: boolean; color?: string; style?: StyleProp<TextStyle>;
}) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: size, fontWeight: weight, color: color ?? (muted ? c.muted : c.text) }, style as any]}>{children}</Text>;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled }: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean;
}) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : 'transparent';
  const fg = variant === 'ghost' ? c.text : variant === 'danger' ? '#fff' : c.onAccent;
  return (
    <Pressable onPress={onPress} disabled={loading || disabled}
      style={({ pressed }) => ({
        backgroundColor: bg, borderColor: c.border, borderWidth: variant === 'ghost' ? 1 : 0,
        borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; rightElement?: React.ReactNode }) {
  const { c } = useTheme();
  const { label, style, rightElement, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <T size={12} muted weight="600">{label}</T> : null}
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput placeholderTextColor={c.muted} autoCapitalize="none"
          style={[{ backgroundColor: c.cardAlt, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, paddingRight: rightElement ? 48 : 14 }, style]}
          {...rest} />
        {rightElement ? (
          <View style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
            {rightElement}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ProgressBar({ parts }: { parts: { value: number; color: string }[] }) {
  const { c } = useTheme();
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.cardAlt }}>
      {parts.map((p, i) => <View key={i} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />)}
    </View>
  );
}

export function ErrorText({ msg }: { msg: string | null }) {
  const { c } = useTheme();
  return msg ? <Text style={{ color: c.danger, fontSize: 13 }}>{msg}</Text> : null;
}

export const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modern themed confirmation dialog popup with icon, backdrop and styled buttons */
export function ConfirmModal({
  visible,
  title,
  message,
  icon,
  iconColor,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { c } = useTheme();
  const themeColor = iconColor ?? (isDestructive ? c.danger : c.accent);
  const defaultIcon = icon ?? (isDestructive ? 'trash-outline' : 'alert-circle-outline');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1.5,
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            elevation: 12,
          }}>
          {/* Top Circular Icon Badge */}
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: themeColor + '18',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderColor: themeColor + '30',
              borderWidth: 1,
            }}>
            <Ionicons name={defaultIcon} size={32} color={themeColor} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: c.text,
              textAlign: 'center',
              marginBottom: 8,
            }}>
            {title}
          </Text>

          {/* Message */}
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: c.muted,
              textAlign: 'center',
              marginBottom: 24,
            }}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            {cancelLabel ? (
              <View style={{ flex: 1 }}>
                <Button label={cancelLabel} variant="ghost" disabled={loading} onPress={onCancel} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                label={confirmLabel}
                variant={isDestructive ? 'danger' : 'primary'}
                loading={loading}
                onPress={onConfirm}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface StatusModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  buttonLabel?: string;
  onClose: () => void;
}

/** Styled information/status popup */
export function StatusModal({
  visible,
  title,
  message,
  type = 'success',
  buttonLabel = 'Got it',
  onClose,
}: StatusModalProps) {
  const { c } = useTheme();
  const color = type === 'error' ? c.danger : type === 'info' ? c.blue : c.accent;
  const icon = type === 'error' ? 'close-circle-outline' : type === 'info' ? 'information-circle-outline' : 'checkmark-circle-outline';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1.5,
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            elevation: 12,
          }}>
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: color + '18',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderColor: color + '30',
              borderWidth: 1,
            }}>
            <Ionicons name={icon} size={36} color={color} />
          </View>

          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: c.text,
              textAlign: 'center',
              marginBottom: 8,
            }}>
            {title}
          </Text>

          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: c.muted,
              textAlign: 'center',
              marginBottom: 24,
            }}>
            {message}
          </Text>

          <View style={{ width: '100%' }}>
            <Button label={buttonLabel} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
