import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

let isNotificationsConfigured = false;

/**
 * Registers notification handler, channels, permissions, and push token.
 * Configured so that notifications display as heads-up alerts on the phone screen
 * and play the device notification sound.
 */
export async function registerPush() {
  try {
    const Notifications = await import('expo-notifications');

    if (!isNotificationsConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'DuoSave Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2ED07C',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          });
        } catch (err) {
          // Channel setup on unsupported environments
        }
      }
      isNotificationsConfigured = true;
    }

    // Request permissions
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    } catch {}

    // Register push token if running on standalone APK or dev build
    const isExpoGo =
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
      (Constants as any).executionEnvironment === 'storeClient';

    if (Platform.OS === 'android' && isExpoGo) {
      // In Expo Go on Android, native remote push registration is limited in SDK 53+.
      // Local notifications with sound and heads-up banner continue to work normally.
      return;
    }

    const Device = await import('expo-device');
    if (!Device.isDevice) return;

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (t?.data) {
      await api.put('/me/push-token', { token: t.data });
    }
  } catch (e: any) {
    console.log('[Push] Notice:', e?.message || e);
  }
}

/**
 * Immediately presents a notification on the phone's screen with sound and vibration.
 * Works across both standalone builds and Expo Go.
 */
export async function presentPhoneNotification(title: string, body: string, data?: any) {
  try {
    const Notifications = await import('expo-notifications');
    await registerPush();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'DuoSave',
        body: body || '',
        sound: 'default',
        vibrate: [0, 250, 250, 250],
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: data || {},
      },
      trigger: null, // null trigger presents immediately
    });
  } catch (err: any) {
    console.warn('[Notification] Could not display notification:', err?.message || err);
  }
}
