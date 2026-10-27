import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from '@/lib/identity';
import { cn } from '@/lib/utils';

/**
 * Google's own "Continue with Google" button (Google Identity Services). The
 * callback receives the ID token for POST /auth/google.
 */
export function GoogleSignInButton({
  clientId,
  onCredential,
  className,
}: {
  clientId: string;
  onCredential: (idToken: string) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((id) => {
        const element = container.current;
        if (cancelled || !element) return;
        id.initialize({
          client_id: clientId,
          callback: (response) => handler.current(response.credential),
          ux_mode: 'popup',
          itp_support: true,
        });
        id.renderButton(element, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, element.offsetWidth)),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (failed)
    return <p className={cn('text-sm text-rose-600', className)}>Google sign-in could not load. Check your connection and try again.</p>;
  return <div ref={container} className={cn('flex min-h-11 w-full justify-center', className)} />;
}
