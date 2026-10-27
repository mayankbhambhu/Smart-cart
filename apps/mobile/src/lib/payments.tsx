import { formatMoney, PAYMENT_METHOD_LABELS, type CheckoutResult, type Order } from '@smartcart/shared';
import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, radius } from '@/components/theme';
import { customerApi, errorMessage } from './api';
import { STRIPE_MERCHANT_ID, WEB_URL } from './config';

type Resolver = (order: Order | null) => void;

async function confirm(paymentId: string, payload?: Record<string, string>): Promise<Order> {
  const result = await customerApi.post<CheckoutResult>(`/payments/${paymentId}/confirm`, payload ? { payload } : {});
  return result.order;
}

/** iOS cannot present a payment sheet while another modal is still animating away. */
export function afterModalClose(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Platform.OS === 'ios' ? 450 : 0));
}

/**
 * Runs the payment for a checkout and resolves with the paid order, or null
 * when the shopper backs out:
 * - Stripe PaymentSheet: cards, Apple Pay (iOS) and Google Pay (Android)
 * - Razorpay UPI: hosted checkout in an auth browser session that returns to the app
 * - PayPal: approval in the browser, captured when the shopper comes back
 * - demo mode: an in-app sheet that simulates the wallet / UPI approval
 */
export function usePayment(): { pay: (checkout: CheckoutResult) => Promise<Order | null>; sheet: ReactNode } {
  const [demo, setDemo] = useState<CheckoutResult | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const finishDemo = useCallback((order: Order | null) => {
    setDemo(null);
    resolver.current?.(order);
    resolver.current = null;
  }, []);

  const pay = useCallback(async (checkout: CheckoutResult): Promise<Order | null> => {
    const action = checkout.payment.clientAction;
    switch (action.type) {
      case 'none':
      case 'cash':
        return checkout.order;
      case 'stripe': {
        await initStripe({ publishableKey: action.publishableKey, merchantIdentifier: STRIPE_MERCHANT_ID, urlScheme: 'smartcart' });
        const init = await initPaymentSheet({
          paymentIntentClientSecret: action.clientSecret,
          merchantDisplayName: action.merchantDisplayName,
          customerId: action.customerId ?? undefined,
          customerEphemeralKeySecret: action.customerEphemeralKeySecret ?? undefined,
          applePay: { merchantCountryCode: action.merchantCountryCode },
          googlePay: { merchantCountryCode: action.merchantCountryCode, testEnv: __DEV__ },
          returnURL: Linking.createURL('payment-return'),
        });
        if (init.error) throw new Error(init.error.message);
        const result = await presentPaymentSheet();
        if (result.error) {
          if (result.error.code === 'Canceled') return null;
          throw new Error(result.error.message);
        }
        return confirm(checkout.payment.id);
      }
      case 'razorpay': {
        const returnUrl = Linking.createURL('payment-return');
        const params = new URLSearchParams({
          key: action.keyId,
          order: action.razorpayOrderId,
          amount: String(action.amount),
          currency: action.currency,
          name: action.merchantName,
          contact: action.prefill.contact ?? '',
          email: action.prefill.email ?? '',
          return: returnUrl,
        });
        const result = await WebBrowser.openAuthSessionAsync(`${WEB_URL}/pay/razorpay?${params.toString()}`, returnUrl);
        if (result.type !== 'success') return null;
        const { queryParams } = Linking.parse(result.url);
        const payload: Record<string, string> = {};
        for (const key of ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']) {
          const value = queryParams?.[key];
          if (typeof value === 'string') payload[key] = value;
        }
        if (!payload.razorpay_payment_id) return null;
        return confirm(checkout.payment.id, payload);
      }
      case 'paypal': {
        await WebBrowser.openBrowserAsync(action.approvalUrl);
        // Back in the app: capture the approved PayPal order (fails if the shopper did not approve).
        return confirm(checkout.payment.id).catch(() => null);
      }
      case 'demo':
        return new Promise<Order | null>((resolve) => {
          resolver.current = resolve;
          setDemo(checkout);
        });
    }
  }, []);

  return { pay, sheet: demo ? <DemoSheet checkout={demo} onDone={finishDemo} /> : null };
}

/** Simulated Apple Pay / Google Pay / UPI approval when the API runs without provider keys. */
function DemoSheet({ checkout, onDone }: { checkout: CheckoutResult; onDone: Resolver }) {
  const method = checkout.payment.method;
  const wallet = method === 'APPLE_PAY' || method === 'GOOGLE_PAY';
  const [stage, setStage] = useState<'confirm' | 'processing' | 'failed'>('confirm');
  const [message, setMessage] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('priya.sharma@okhdfcbank');

  const submit = async (outcome: 'success' | 'failure') => {
    setStage('processing');
    await new Promise((r) => setTimeout(r, method === 'UPI' ? 1200 : 700));
    try {
      const result = await customerApi.post<CheckoutResult>(`/payments/${checkout.payment.id}/demo`, { outcome });
      if (result.payment.status === 'SUCCEEDED') onDone(result.order);
      else {
        setStage('failed');
        setMessage('The payment was declined. Try again or choose another method.');
      }
    } catch (error) {
      setStage('failed');
      setMessage(errorMessage(error));
    }
  };

  const confirmLabel =
    method === 'UPI'
      ? 'Approve in UPI app'
      : method === 'APPLE_PAY'
        ? Platform.OS === 'ios'
          ? 'Pay with Face ID'
          : 'Confirm Apple Pay'
        : method === 'GOOGLE_PAY'
          ? 'Pay with Google Pay'
          : `Pay ${formatMoney(checkout.payment.amount)}`;

  return (
    <Modal
      transparent
      animationType="slide"
      visible
      onRequestClose={() => {
        if (stage !== 'processing') onDone(null);
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, wallet && { backgroundColor: '#0b0f19' }]}>
          <View style={styles.row}>
            <Text style={[styles.method, wallet && { color: '#fff' }]}>{PAYMENT_METHOD_LABELS[method]}</Text>
            <Text style={styles.demo}>DEMO</Text>
          </View>
          <Text style={[styles.merchant, wallet && { color: 'rgba(255,255,255,0.6)' }]}>SmartCart · {checkout.order.storeName}</Text>
          <Text style={[styles.amount, wallet && { color: '#fff' }]}>{formatMoney(checkout.payment.amount)}</Text>
          {method === 'UPI' && stage === 'confirm' && (
            <TextInput value={upiId} onChangeText={setUpiId} style={styles.input} autoCapitalize="none" placeholder="yourname@bank" />
          )}
          {stage === 'processing' ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}>
              <ActivityIndicator color={wallet ? '#fff' : colors.brand} />
              <Text style={{ color: wallet ? '#fff' : colors.muted }}>
                {method === 'UPI' ? 'Waiting for approval in your UPI app…' : 'Processing…'}
              </Text>
            </View>
          ) : stage === 'failed' ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.danger, textAlign: 'center' }}>{message}</Text>
              <Button title="Try again" onPress={() => setStage('confirm')} block />
              <Button title="Choose another method" variant="ghost" onPress={() => onDone(null)} block />
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button
                title={confirmLabel}
                onPress={() => void submit('success')}
                variant={wallet ? 'secondary' : 'primary'}
                size="lg"
                block
              />
              <Button title="Simulate a declined payment" variant="ghost" size="sm" onPress={() => void submit('failure')} />
              <Button title="Cancel" variant="ghost" size="sm" onPress={() => onDone(null)} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 40,
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method: { fontSize: 15, fontWeight: '700', color: colors.ink },
  demo: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  merchant: { textAlign: 'center', color: colors.muted, marginTop: 12 },
  amount: { textAlign: 'center', fontSize: 38, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  input: { height: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: radius.md, paddingHorizontal: 12, fontSize: 15 },
});
