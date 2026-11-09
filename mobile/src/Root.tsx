import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from './auth';
import { useTheme } from './theme';
import { useLanguage } from './i18n';
import { api } from './api';
import { presentPhoneNotification, registerPush } from './push';
import { SwipeableItem, T } from './ui';
import AuthScreen from './screens/AuthScreen';
import SetupScreen from './screens/SetupScreen';
import SavingsScreen from './screens/SavingsScreen';
import LoansScreen from './screens/LoansScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import ActivityScreen from './screens/ActivityScreen';
import AccountScreen from './screens/AccountScreen';
import SavingsRulesScreen from './screens/SavingsRulesScreen';

const Tab = createBottomTabNavigator();
const icon = (name: keyof typeof Ionicons.glyphMap, focused: keyof typeof Ionicons.glyphMap) =>
  ({ color, size, focused: f }: { color: string; size: number; focused: boolean }) =>
    <Ionicons name={f ? focused : name} size={size} color={color} />;

export default function Root() {
  const { c, isDark } = useTheme();
  const { t } = useLanguage();
  const { ready, me } = useAuth();
  const [activeBanner, setActiveBanner] = useState<{ id: string; title: string; body: string } | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  const navTheme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.card, border: c.border, text: c.text, primary: c.accent },
  }), [isDark, c.bg, c.card, c.border, c.text, c.accent]);

  const bar = <StatusBar style={isDark ? 'light' : 'dark'} />;

  // Real-time notification poller & sound notifier
  useEffect(() => {
    if (!me?.vault) return;
    registerPush();

    let isMounted = true;

    const checkNotifications = async () => {
      try {
        const notifs = await api.get<Array<{ id: string; title: string; body: string; read?: boolean }>>('/notifications');
        if (!isMounted || !Array.isArray(notifs)) return;

        if (!initialLoadDone.current) {
          notifs.forEach((n) => seenIds.current.add(n.id));
          initialLoadDone.current = true;
          return;
        }

        const incoming = notifs.filter((n) => !seenIds.current.has(n.id) && !n.read);
        for (const notif of incoming) {
          seenIds.current.add(notif.id);

          // 1. Trigger system heads-up notification banner on phone screen + sound
          presentPhoneNotification(notif.title, notif.body, notif);

          // 2. Trigger floating in-app banner alert
          setActiveBanner({ id: notif.id, title: notif.title, body: notif.body });
        }
      } catch {}
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [me?.vault?.id]);

  // Auto-dismiss floating banner after 6 seconds
  useEffect(() => {
    if (!activeBanner) return;
    const timer = setTimeout(() => {
      setActiveBanner(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeBanner]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
        {bar}
        <View />
        <View style={{ alignItems: 'center', gap: 18 }}>
          {/* Centered DuoSave Logo (Clean, borderless) */}
          <Image
            source={require('../assets/icon.png')}
            style={{ width: 104, height: 104 }}
            resizeMode="contain"
          />

          <View style={{ alignItems: 'center', gap: 6 }}>
            <T size={34} weight="800" style={{ letterSpacing: 0.5 }}>DuoSave</T>
            <T size={14} muted style={{ letterSpacing: 0.2 }}>
              Shared Savings Vault
            </T>
          </View>

          <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 12 }} />
        </View>

        {/* Footer Security Badge */}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={14} color={c.accent} />
            <T size={12} weight="600" color={c.accent}>End-to-End Encrypted</T>
          </View>
          <T size={11} muted>v1.0.0</T>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {bar}

      {/* Floating In-App Notification Banner on Phone Screen */}
      {activeBanner && (
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 16, right: 16, zIndex: 9999 }}>
          <SwipeableItem onDelete={() => setActiveBanner(null)}>
            <View style={{
              backgroundColor: c.card,
              borderColor: c.accent,
              borderWidth: 1.5,
              borderRadius: 16,
              padding: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{ backgroundColor: c.accent + '22', padding: 8, borderRadius: 10 }}>
                <Ionicons name="notifications" size={22} color={c.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700" size={14} color={c.accent}>{activeBanner.title}</T>
                <T size={13} numberOfLines={2}>{activeBanner.body}</T>
              </View>
              <Pressable onPress={() => setActiveBanner(null)} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={c.muted} />
              </Pressable>
            </View>
          </SwipeableItem>
        </SafeAreaView>
      )}

      {!me ? (
        <AuthScreen />
      ) : (
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted }}>
          {!me.vault ? (
            <Tab.Screen name="Setup" component={SetupScreen} options={{ tabBarLabel: t('tab_setup'), tabBarIcon: icon('wallet-outline', 'wallet') }} />
          ) : (
            <>
              <Tab.Screen name="Savings" component={SavingsScreen} options={{ tabBarLabel: t('tab_savings'), tabBarIcon: icon('wallet-outline', 'wallet') }} />
              <Tab.Screen name="Loans" component={LoansScreen} options={{ tabBarLabel: t('tab_loans'), tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }} />
              <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ tabBarLabel: t('tab_analytics'), tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
              <Tab.Screen name="Activity" component={ActivityScreen} options={{ tabBarLabel: t('tab_activity'), tabBarIcon: icon('notifications-outline', 'notifications') }} />
              <Tab.Screen name="Rules" component={SavingsRulesScreen} options={{ tabBarLabel: t('tab_rules'), tabBarIcon: icon('document-text-outline', 'document-text') }} />
              <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarLabel: t('tab_account'), tabBarIcon: icon('person-outline', 'person') }} />
            </>
          )}
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}
