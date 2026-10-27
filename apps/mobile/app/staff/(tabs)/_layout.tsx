import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { colors } from '@/components/theme';
import type { IconName } from '@/components/ui';
import { useSession } from '@/lib/auth';

const icon =
  (name: IconName, active: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : name} size={size} color={typeof color === 'string' ? color : colors.muted} />
  );

export default function StaffTabsLayout() {
  const session = useSession('STAFF');
  if (!session || session.user.mustChangePassword || session.memberships.length === 0) return <Redirect href="/staff/login" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '800' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('today-outline', 'today') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: icon('checkbox-outline', 'checkbox') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Restock', tabBarIcon: icon('alert-circle-outline', 'alert-circle') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline', 'scan') }} />
    </Tabs>
  );
}
