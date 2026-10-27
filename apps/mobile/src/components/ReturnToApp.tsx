import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Loader } from './ui';

/**
 * Landing route for links that come back from the browser (payment and
 * sign-in redirects). The browser session already handed the result to the
 * screen that opened it, so this route only steps back out of the way.
 */
export function ReturnToApp() {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 50);
    return () => clearTimeout(timer);
  }, [router]);
  return <Loader />;
}
