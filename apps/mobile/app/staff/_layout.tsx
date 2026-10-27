import { Stack } from 'expo-router';
import { colors } from '@/components/theme';

/** Staff mode: store employees sign in with the credentials SmartCart issued them. */
export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Staff sign-in' }} />
    </Stack>
  );
}
