import type { AuthProvidersInfo } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Button } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { returnToApp, safeAppReturnUrl } from '@/lib/appReturn';

/**
 * "Continue with Google" for the mobile app. The app opens this page in an
 * auth browser session; Google Identity Services signs the shopper in with
 * the web client and the ID token goes back to the app, which exchanges it
 * at POST /auth/google like the website does.
 */
export default function GoogleBridgePage() {
  const [params] = useSearchParams();
  const returnUrl = safeAppReturnUrl(params.get('return'));
  const { data: providers, isError } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => publicApi.get<AuthProvidersInfo>('/auth/providers'),
  });
  const clientId = providers?.google.webClientId;

  let body;
  if (!returnUrl)
    body = <p className="text-sm text-slate-600">This sign-in link is incomplete. Go back to the SmartCart app and try again.</p>;
  else if (isError) body = <p className="text-sm text-slate-600">Could not reach SmartCart. Check your connection and try again.</p>;
  else if (!providers) body = <p className="text-sm text-slate-500">Loading…</p>;
  else if (!clientId) body = <p className="text-sm text-slate-600">Google sign-in is not set up for this server yet.</p>;
  else body = <GoogleSignInButton clientId={clientId} onCredential={(idToken) => returnToApp(returnUrl, { id_token: idToken })} />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6 text-center">
      <Logo />
      <div className="w-full max-w-sm space-y-2">
        <h1 className="text-xl font-extrabold text-slate-900">Sign in to the SmartCart app</h1>
        <p className="text-sm text-slate-500">Continue with your Google account. You will go straight back to the app.</p>
      </div>
      <div className="w-full max-w-sm">{body}</div>
      {returnUrl && (
        <Button variant="ghost" onClick={() => returnToApp(returnUrl, { cancelled: '1' })}>
          Cancel
        </Button>
      )}
    </div>
  );
}
