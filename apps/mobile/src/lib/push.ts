import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createClient } from './api';
import type { Realm } from './auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Registers this device for push notifications (order updates, family list
 * changes, task assignments, restock alerts). Silently skips simulators and
 * builds without an EAS project id.
 */
export async function registerForPush(realm: Realm): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'SmartCart', importance: Notifications.AndroidImportance.HIGH });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await createClient(realm).post('/me/push-tokens', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
}
