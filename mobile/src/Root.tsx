import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from './auth';
import { useTheme } from './theme';
import AuthScreen from './screens/AuthScreen';
import SetupScreen from './screens/SetupScreen';
import SavingsScreen from './screens/SavingsScreen';
import LoansScreen from './screens/LoansScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import ActivityScreen from './screens/ActivityScreen';
import AccountScreen from './screens/AccountScreen';

const Tab = createBottomTabNavigator();
const icon = (name: keyof typeof Ionicons.glyphMap, focused: keyof typeof Ionicons.glyphMap) =>
  ({ color, size, focused: f }: { color: string; size: number; focused: boolean }) =>
    <Ionicons name={f ? focused : name} size={size} color={color} />;

export default function Root() {
  const { c, isDark } = useTheme();
  const { ready, me } = useAuth();
  const navTheme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.card, border: c.border, text: c.text, primary: c.accent },
  }), [isDark, c.bg, c.card, c.border, c.text, c.accent]);

  const bar = <StatusBar key={isDark ? 'dark' : 'light'} />;

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
      {bar}
      <ActivityIndicator color={c.accent} />
    </View>
  );
  return (
    <NavigationContainer theme={navTheme}>
      {bar}
      {!me ? <AuthScreen /> : !me.vault ? <SetupScreen /> : (
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted }}>
          <Tab.Screen name="Savings" component={SavingsScreen} options={{ tabBarIcon: icon('wallet-outline', 'wallet') }} />
          <Tab.Screen name="Loans" component={LoansScreen} options={{ tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }} />
          <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
          <Tab.Screen name="Activity" component={ActivityScreen} options={{ tabBarIcon: icon('notifications-outline', 'notifications') }} />
          <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon('person-outline', 'person') }} />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}
