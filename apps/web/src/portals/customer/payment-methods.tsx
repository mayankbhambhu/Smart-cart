import { PAYMENT_METHOD_LABELS, type OrderChannel, type PaymentMethodType, type SavedPaymentMethod } from '@smartcart/shared';
import { Banknote, CreditCard, Fingerprint, Smartphone, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePaymentsConfig, useSavedMethods } from './hooks';

export const METHOD_ICONS: Record<PaymentMethodType, ReactNode> = {
  UPI: <Smartphone className="size-5" />,
  CARD: <CreditCard className="size-5" />,
  APPLE_PAY: <Fingerprint className="size-5" />,
  GOOGLE_PAY: <Wallet className="size-5" />,
  PAYPAL: <Wallet className="size-5" />,
  CASH_ON_DELIVERY: <Banknote className="size-5" />,
};

const METHOD_HINTS: Record<PaymentMethodType, string> = {
  UPI: 'Google Pay, PhonePe, Paytm, BHIM',
  CARD: 'Visa, Mastercard, RuPay, Amex',
  APPLE_PAY: 'Face ID / Touch ID on iPhone, Mac',
  GOOGLE_PAY: 'Pay with your Google wallet',
  PAYPAL: 'Your PayPal balance or linked card',
  CASH_ON_DELIVERY: 'Pay the rider in cash or UPI',
};

export interface MethodChoice {
  method: PaymentMethodType;
  savedPaymentMethodId?: string;
}

/** Payment options available for a channel, including the customer's saved UPI IDs and cards. */
export function PaymentMethodPicker({
  channel,
  value,
  onChange,
}: {
  channel: OrderChannel;
  value: MethodChoice | null;
  onChange: (choice: MethodChoice) => void;
}) {
  const { data: config } = usePaymentsConfig();
  const { data: saved = [] } = useSavedMethods();
  const methods = (config?.methods ?? []).filter((m) => m.channels.includes(channel));
  const savedFor = (method: PaymentMethodType): SavedPaymentMethod[] =>
    saved.filter((s) => s.type === method || (s.type === 'CARD' && method === 'CARD'));

  return (
    <div className="space-y-2">
      {methods.map(({ method, live }) => {
        const options = savedFor(method);
        const selected = value?.method === method && !value.savedPaymentMethodId;
        return (
          <div key={method} className="space-y-2">
            <button
              type="button"
              onClick={() => onChange({ method })}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                {METHOD_ICONS[method]}
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {PAYMENT_METHOD_LABELS[method]}
                  {!live && method !== 'CASH_ON_DELIVERY' && <Badge tone="yellow">Demo</Badge>}
                </span>
                <span className="block text-xs text-slate-500">{METHOD_HINTS[method]}</span>
              </span>
              <span
                className={cn(
                  'size-5 rounded-full border-2',
                  selected ? 'border-brand-600 bg-brand-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300',
                )}
              />
            </button>
            {options.map((option) => {
              const active = value?.savedPaymentMethodId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ method, savedPaymentMethodId: option.id })}
                  className={cn(
                    'ml-6 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm',
                    active ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <span className="flex-1 font-medium text-slate-800">{option.label}</span>
                  {option.isDefault && <Badge tone="gray">Default</Badge>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
