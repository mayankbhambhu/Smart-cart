import { formatMoney, PAYMENT_METHOD_LABELS, type CheckoutResult, type Order, type PaymentMethodType } from '@smartcart/shared';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { CheckCircle2, CreditCard, Fingerprint, Loader2, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { loadScript } from '@/lib/scripts';
import { cn } from '@/lib/utils';

type Resolver = (order: Order | null) => void;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (e: unknown) => void) => void };
  }
}

const stripePromises = new Map<string, Promise<Stripe | null>>();

/**
 * Runs the payment step for a checkout. Resolves with the paid order, or
 * null if the shopper closed the sheet.
 */
export function usePayment(): { pay: (checkout: CheckoutResult) => Promise<Order | null>; sheet: ReactNode } {
  const [active, setActive] = useState<CheckoutResult | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const finish = useCallback((order: Order | null) => {
    setActive(null);
    resolver.current?.(order);
    resolver.current = null;
  }, []);

  const pay = useCallback(async (checkout: CheckoutResult): Promise<Order | null> => {
    const action = checkout.payment.clientAction;
    if (action.type === 'cash' || action.type === 'none') return checkout.order;
    if (action.type === 'paypal') {
      window.location.href = action.approvalUrl;
      return new Promise<Order | null>(() => undefined);
    }
    if (action.type === 'razorpay') {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      return new Promise<Order | null>((resolve) => {
        const rzp = new window.Razorpay!({
          key: action.keyId,
          order_id: action.razorpayOrderId,
          amount: action.amount,
          currency: action.currency,
          name: action.merchantName,
          prefill: action.prefill,
          theme: { color: '#0a8f45' },
          modal: { ondismiss: () => resolve(null) },
          handler: async (response: Record<string, string>) => {
            const result = await customerApi.post<CheckoutResult>(`/payments/${checkout.payment.id}/confirm`, { payload: response });
            resolve(result.order);
          },
        });
        rzp.open();
      });
    }
    return new Promise<Order | null>((resolve) => {
      resolver.current = resolve;
      setActive(checkout);
    });
  }, []);

  const sheet = active ? (
    active.payment.clientAction.type === 'stripe' ? (
      <StripeSheet checkout={active} onDone={finish} />
    ) : (
      <DemoSheet checkout={active} onDone={finish} />
    )
  ) : null;

  return { pay, sheet };
}

const methodIcon: Record<PaymentMethodType, ReactNode> = {
  UPI: <Smartphone className="size-5" />,
  CARD: <CreditCard className="size-5" />,
  APPLE_PAY: <Fingerprint className="size-5" />,
  GOOGLE_PAY: <Wallet className="size-5" />,
  PAYPAL: <Wallet className="size-5" />,
  CASH_ON_DELIVERY: <Wallet className="size-5" />,
};

/** Simulated wallet / UPI / card sheet used when the provider runs in demo mode. */
function DemoSheet({ checkout, onDone }: { checkout: CheckoutResult; onDone: Resolver }) {
  const method = checkout.payment.method;
  const [stage, setStage] = useState<'confirm' | 'processing' | 'done' | 'failed'>('confirm');
  const [message, setMessage] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('priya.sharma@okhdfcbank');

  const submit = async (outcome: 'success' | 'failure') => {
    setStage('processing');
    await new Promise((r) => setTimeout(r, method === 'UPI' ? 1400 : 900));
    try {
      const result = await customerApi.post<CheckoutResult>(`/payments/${checkout.payment.id}/demo`, { outcome });
      if (result.payment.status === 'SUCCEEDED') {
        setStage('done');
        setTimeout(() => onDone(result.order), 700);
      } else {
        setStage('failed');
        setMessage('The payment was declined. Try again or pick another method.');
      }
    } catch (error) {
      setStage('failed');
      setMessage(errorMessage(error));
    }
  };

  const wallet = method === 'APPLE_PAY' || method === 'GOOGLE_PAY';
  return (
    <Modal open onClose={() => stage !== 'processing' && onDone(null)} size="sm">
      <div className={cn('-mx-5 -my-4 p-6', wallet ? 'bg-slate-950 text-white' : 'bg-white')}>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            {methodIcon[method]} {PAYMENT_METHOD_LABELS[method]}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              wallet ? 'bg-white/10 text-white/70' : 'bg-amber-100 text-amber-800',
            )}
          >
            Demo
          </span>
        </div>
        <div className="mt-6 text-center">
          <p className={cn('text-sm', wallet ? 'text-white/60' : 'text-slate-500')}>SmartCart · {checkout.order.storeName}</p>
          <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">{formatMoney(checkout.payment.amount)}</p>
          <p className={cn('mt-1 text-xs', wallet ? 'text-white/50' : 'text-slate-400')}>Order {checkout.order.orderNumber}</p>
        </div>

        {method === 'UPI' && stage === 'confirm' && (
          <div className="mt-6 space-y-2">
            <label className="text-xs font-semibold text-slate-500">UPI ID</label>
            <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} />
            <p className="text-xs text-slate-500">A collect request is sent to your UPI app (GPay, PhonePe, Paytm, BHIM).</p>
          </div>
        )}
        {method === 'CARD' && stage === 'confirm' && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Input className="col-span-2" defaultValue="4242 4242 4242 4242" aria-label="Card number" />
            <Input defaultValue="12 / 29" aria-label="Expiry" />
            <Input defaultValue="123" aria-label="CVC" />
          </div>
        )}

        <div className="mt-7 space-y-2">
          {stage === 'confirm' && (
            <>
              <Button
                block
                size="lg"
                variant={wallet ? 'secondary' : 'primary'}
                className={wallet ? 'bg-white text-slate-950 hover:bg-white/90' : undefined}
                onClick={() => submit('success')}
              >
                {wallet ? <Fingerprint className="size-5" /> : <ShieldCheck className="size-5" />}
                {method === 'UPI'
                  ? 'Send payment request'
                  : wallet
                    ? 'Confirm with Face ID'
                    : `Pay ${formatMoney(checkout.payment.amount)}`}
              </Button>
              <button
                type="button"
                className={cn('w-full text-center text-xs underline', wallet ? 'text-white/50' : 'text-slate-400')}
                onClick={() => submit('failure')}
              >
                Simulate a declined payment
              </button>
            </>
          )}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-2 py-3 text-sm">
              <Loader2 className="size-7 animate-spin" />
              {method === 'UPI' ? 'Waiting for approval in your UPI app…' : 'Processing…'}
            </div>
          )}
          {stage === 'done' && (
            <div className="flex flex-col items-center gap-2 py-3 text-sm font-semibold text-brand-500">
              <CheckCircle2 className="size-10" /> Payment successful
            </div>
          )}
          {stage === 'failed' && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-rose-500">{message}</p>
              <Button block onClick={() => setStage('confirm')}>
                Try again
              </Button>
              <Button block variant="ghost" onClick={() => onDone(null)}>
                Choose another method
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Stripe Payment Element: cards plus Apple Pay / Google Pay wallets where supported. */
function StripeSheet({ checkout, onDone }: { checkout: CheckoutResult; onDone: Resolver }) {
  const action = checkout.payment.clientAction;
  const publishableKey = action.type === 'stripe' ? action.publishableKey : '';
  const stripePromise = useMemo(() => {
    let promise = stripePromises.get(publishableKey);
    if (!promise) {
      promise = loadStripe(publishableKey);
      stripePromises.set(publishableKey, promise);
    }
    return promise;
  }, [publishableKey]);
  if (action.type !== 'stripe') return null;
  return (
    <Modal open onClose={() => onDone(null)} title={`Pay ${formatMoney(checkout.payment.amount)}`} description="Secured by Stripe">
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: action.clientSecret,
          appearance: { theme: 'stripe', variables: { colorPrimary: '#0a8f45', borderRadius: '12px' } },
        }}
      >
        <StripeForm checkout={checkout} onDone={onDone} />
      </Elements>
    </Modal>
  );
}

function StripeForm({ checkout, onDone }: { checkout: CheckoutResult; onDone: Resolver }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError(null);
        const { error: stripeError } = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: `${window.location.origin}/orders/${checkout.order.id}` },
        });
        if (stripeError) {
          setError(stripeError.message ?? 'Payment failed');
          setBusy(false);
          return;
        }
        try {
          const result = await customerApi.post<CheckoutResult>(`/payments/${checkout.payment.id}/confirm`, {});
          onDone(result.order);
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <PaymentElement options={{ wallets: { applePay: 'auto', googlePay: 'auto' } }} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" block size="lg" loading={busy} disabled={!stripe}>
        Pay {formatMoney(checkout.payment.amount)}
      </Button>
    </form>
  );
}
