import { SocketEvents, type AppNotification } from '@smartcart/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/theme';
import { ToastHost } from '@/components/ui';
import { bootstrapSessions } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';
import { useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  const ready = useAuth((s) => s.ready);

  useEffect(() => {
    void bootstrapSessions();
  }, []);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
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
          <Stack.Screen name="login" options={{ presentation: 'modal', title: 'Log in or sign up' }} />
          <Stack.Screen name="cart" options={{ presentation: 'modal', title: 'My cart' }} />
          <Stack.Screen name="product/[id]" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="stores" options={{ title: 'Stores & stock' }} />
          <Stack.Screen name="exit/[id]" options={{ title: 'Exit pass', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="staff" options={{ headerShown: false }} />
          <Stack.Screen name="payment-return" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
          <Stack.Screen name="auth/google" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
        </Stack>
        <LiveAlerts />
        <ToastHost />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** In-app banners for server notifications, and push registration once signed in. */
function LiveAlerts() {
  const customer = useAuth((s) => s.sessions.CUSTOMER?.user.id);
  const staff = useAuth((s) => s.sessions.STAFF?.user.id);
  useEffect(() => {
    if (customer) void registerForPush('CUSTOMER').catch(() => undefined);
  }, [customer]);
  useEffect(() => {
    if (staff) void registerForPush('STAFF').catch(() => undefined);
  }, [staff]);
  useSocketEvent<AppNotification>('CUSTOMER', SocketEvents.NOTIFICATION, (n) => toast.info(n.title, n.body));
  useSocketEvent<AppNotification>('STAFF', SocketEvents.NOTIFICATION, (n) => toast.info(n.title, n.body));
  return null;
}
