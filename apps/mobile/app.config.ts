import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Apple Pay merchant ID, used by the Stripe config plugin at build time and by the app at run time. */
const STRIPE_MERCHANT_ID = process.env.STRIPE_MERCHANT_ID ?? 'merchant.dev.smartcart';

/**
 * EXPO_PUBLIC_API_URL points the app at the SmartCart API. In development it
 * defaults to the machine running `expo start` (port 4000).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SmartCart',
  slug: 'smartcart',
  scheme: 'smartcart',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'dev.smartcart.app',
    supportsTablet: true,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: 'SmartCart uses the camera to scan product barcodes, your exit pass and the attendance kiosk QR.',
      NSLocationWhenInUseUsageDescription:
        'SmartCart uses your location to find nearby stores and to confirm staff clock-ins at the store.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'dev.smartcart.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0a8f45' },
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'VIBRATE'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, backgroundColor: '#0a8f45' }],
    [
      'expo-camera',
      { cameraPermission: 'SmartCart uses the camera to scan product barcodes, your exit pass and the attendance kiosk QR.' },
    ],
    [
      'expo-location',
      { locationWhenInUsePermission: 'SmartCart uses your location to find nearby stores and to confirm staff clock-ins.' },
    ],
    ['expo-notifications', { color: '#0a8f45' }],
    ['@stripe/stripe-react-native', { merchantIdentifier: STRIPE_MERCHANT_ID, enableGooglePay: true }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL,
    stripeMerchantId: STRIPE_MERCHANT_ID,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
