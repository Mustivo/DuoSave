import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

/** Registers this phone so the server can send reminders. */
export async function registerPush() {
  // Expo Go on Android removed remote push support in SDK 53+.
  // Check dynamically inside the call to ensure Constants is fully initialized.
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any).executionEnvironment === 'storeClient';

  if (Platform.OS === 'android' && isExpoGo) {
    // In Expo Go on Android, native push registration is unavailable.
    // It will work normally in the standalone APK build.
    return;
  }

  try {
    const Device = await import('expo-device');
    const Notifications = await import('expo-notifications');
    if (!Device.isDevice) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
        });
      } catch (err: any) {
        // Notification channels are only supported on physical devices / standalone builds
      }
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === 'granted' ? existing : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (t?.data) {
      await api.put('/me/push-token', { token: t.data });
    }
  } catch (e: any) {
    // Suppress verbose stack traces during development
    console.log('[Push] Registration skipped:', e?.message || e);
  }
}
