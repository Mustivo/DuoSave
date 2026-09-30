import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

// Expo Go on Android removed remote push support (SDK 53+). Merely importing
// expo-notifications there throws, so we load it lazily and skip it in that case.
const pushUnavailable =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Registers this phone so the server can send "time to save" messages. */
export async function registerPush() {
  if (pushUnavailable) return; // reminders still appear inside the app
  try {
    const Device = await import('expo-device');
    const Notifications = await import('expo-notifications');
    if (!Device.isDevice) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default', importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === 'granted' ? existing : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.put('/me/push-token', { token: t.data });
  } catch (e) { console.warn('push registration skipped', e); }
}