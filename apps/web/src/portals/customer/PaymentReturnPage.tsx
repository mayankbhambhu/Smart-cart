import type { CheckoutResult } from '@smartcart/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, EmptyState, PageLoader } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { useCart } from '@/lib/stores';

/** PayPal sends the shopper back here after approving (or cancelling) the payment. */
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const clearCart = useCart((s) => s.clear);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const paymentId = params.get('paymentId');
  const cancelled = params.get('cancelled') === '1';

  useEffect(() => {
    if (started.current || !paymentId || cancelled) return;
    started.current = true;
    const payload: Record<string, string> = {};
    for (const key of ['token', 'PayerID']) {
      const value = params.get(key);
      if (value) payload[key] = value;
    }
    customerApi
      .post<CheckoutResult>(`/payments/${paymentId}/confirm`, { payload })
      .then(({ order }) => {
        if (order.channel !== 'IN_STORE') clearCart();
        navigate(order.channel === 'IN_STORE' ? `/exit/${order.id}` : `/orders/${order.id}`, { replace: true });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [paymentId, cancelled, params, navigate, clearCart]);

  if (!paymentId)
    return (
      <EmptyState
        icon="🤔"
        title="Nothing to confirm"
        action={
          <Link to="/orders">
            <Button>My orders</Button>
          </Link>
        }
      />
    );
  if (cancelled || error) {
    return (
      <EmptyState
        icon="💳"
        title={cancelled ? 'Payment cancelled' : 'Payment could not be confirmed'}
        body={error ?? 'No money was taken. You can retry the payment from your order.'}
        action={
          <Link to="/orders">
            <Button>Go to my orders</Button>
          </Link>
        }
      />
    );
  }
  return <PageLoader label="Confirming your PayPal payment…" />;
}
