import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui';
import { returnToApp, safeAppReturnUrl } from '@/lib/appReturn';
import { loadScript } from '@/lib/scripts';

/**
 * Razorpay UPI checkout for the mobile app. The app opens this page in an
 * auth browser session; the result (signed by Razorpay) goes back to the app,
 * which asks the API to verify the signature before the order counts as paid.
 */
export default function RazorpayBridgePage() {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const returnUrl = safeAppReturnUrl(params.get('return'));

  useEffect(() => {
    if (!returnUrl || !params.get('key') || !params.get('order')) {
      setError('This payment link is incomplete. Go back to the SmartCart app and try again.');
      return;
    }
    const back = (values: Record<string, string>) => returnToApp(returnUrl, values);
    loadScript('https://checkout.razorpay.com/v1/checkout.js').then(
      () => {
        const checkout = new window.Razorpay!({
          key: params.get('key'),
          order_id: params.get('order'),
          amount: Number(params.get('amount')),
          currency: params.get('currency') ?? 'INR',
          name: params.get('name') ?? 'SmartCart',
          prefill: { contact: params.get('contact') ?? '', email: params.get('email') ?? '' },
          method: { upi: true },
          theme: { color: '#0a8f45' },
          modal: { ondismiss: () => back({ cancelled: '1' }) },
          handler: (response: Record<string, string>) => back(response),
        });
        checkout.open();
      },
      () => setError('Could not reach Razorpay. Check your connection and try again.'),
    );
  }, [params, returnUrl]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6 text-center">
      <Logo />
      {error ? (
        <>
          <p className="max-w-sm text-sm text-slate-600">{error}</p>
          {returnUrl && <Button onClick={() => returnToApp(returnUrl, { cancelled: '1' })}>Back to the app</Button>}
        </>
      ) : (
        <p className="text-sm text-slate-500">Opening UPI payment…</p>
      )}
    </div>
  );
}
