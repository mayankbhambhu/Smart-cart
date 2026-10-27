import { formatMoney, type Address, type CheckoutResult, type PickupSlotDay, type QuoteResult } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Home, MapPin, Plus, ShoppingBag, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePayment } from '@/components/PaymentSheet';
import { ProductArt } from '@/components/product';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Segmented, Textarea } from '@/components/ui';
import { customerApi, errorMessage, publicApi } from '@/lib/api';
import { cartTotals, useCart, useShop, useCartLines } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn, formatTime } from '@/lib/utils';
import { BillRows } from './CustomerLayout';
import { AddressForm } from './AddressForm';
import { useAddresses, useCurrentStore } from './hooks';
import { PaymentMethodPicker, type MethodChoice } from './payment-methods';

export default function CheckoutPage() {
  const { store } = useCurrentStore();
  const mode = useShop((s) => s.mode);
  const setMode = useShop((s) => s.setMode);
  const channel = mode === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
  const lines = useCartLines(store?.id);
  const clearCart = useCart((s) => s.clear);
  const { data: addresses = [] } = useAddresses();
  const selectedAddressId = useShop((s) => s.addressId);
  const setAddress = useShop((s) => s.setAddress);
  const [addingAddress, setAddingAddress] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<MethodChoice | null>(null);
  const coupon = sessionStorage.getItem('smartcart-coupon') ?? '';
  const { pay, sheet } = usePayment();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const address = addresses.find((a) => a.id === selectedAddressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  useEffect(() => {
    if (address && address.id !== selectedAddressId) setAddress(address.id);
  }, [address, selectedAddressId, setAddress]);

  const { data: slots = [] } = useQuery({
    queryKey: ['pickup-slots', store?.id],
    queryFn: () => publicApi.get<PickupSlotDay[]>(`/stores/${store!.id}/pickup-slots`, { query: { days: 3 } }),
    enabled: Boolean(store) && channel === 'PICKUP',
  });
  const [day, setDay] = useState(0);

  const items = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
  const { data: quote } = useQuery({
    queryKey: ['checkout-quote', store?.id, channel, JSON.stringify(items), coupon, tip],
    queryFn: () =>
      customerApi.post<QuoteResult>('/orders/quote', {
        storeId: store!.id,
        channel,
        items,
        couponCode: coupon || undefined,
        tip: channel === 'DELIVERY' ? tip : undefined,
      }),
    enabled: Boolean(store) && items.length > 0,
  });

  const place = useMutation({
    mutationFn: async () => {
      const checkout = await customerApi.post<CheckoutResult>('/orders', {
        storeId: store!.id,
        channel,
        items,
        couponCode: quote?.offer?.applicable ? coupon : undefined,
        tip: channel === 'DELIVERY' ? tip : undefined,
        addressId: channel === 'DELIVERY' ? address?.id : undefined,
        pickupSlotStart: channel === 'PICKUP' ? slot : undefined,
        paymentMethod: method!.method,
        savedPaymentMethodId: method!.savedPaymentMethodId,
        notes: notes || undefined,
        idempotencyKey,
      });
      const paid = await pay(checkout);
      return { checkout, paid };
    },
    onSuccess: ({ checkout, paid }) => {
      clearCart();
      sessionStorage.removeItem('smartcart-coupon');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (paid) toast.success(channel === 'PICKUP' ? 'Pickup booked!' : 'Order placed!', `Order ${checkout.order.orderNumber}`);
      else toast.info('Payment not completed', 'You can finish paying from your orders page.');
      navigate(`/orders/${checkout.order.id}`);
    },
    onError: (error) => toast.error('Could not place the order', errorMessage(error)),
  });

  if (lines.length === 0) {
    return (
      <EmptyState
        icon="🛒"
        title="Your cart is empty"
        body="Add a few things to check out."
        action={<Button onClick={() => navigate('/')}>Browse products</Button>}
      />
    );
  }

  const ready = Boolean(method) && (channel === 'DELIVERY' ? Boolean(address) : Boolean(slot)) && (quote?.unavailable.length ?? 0) === 0;
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-slate-900">Checkout</h1>
          <Segmented
            value={channel}
            onChange={(v) => setMode(v)}
            options={[
              {
                value: 'DELIVERY',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="size-4" /> Delivery
                  </span>
                ),
              },
              {
                value: 'PICKUP',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ShoppingBag className="size-4" /> Pickup
                  </span>
                ),
              },
            ]}
          />
        </div>

        {channel === 'DELIVERY' ? (
          <Card>
            <CardHeader
              title="Delivery address"
              subtitle={`${store?.name} delivers within ${store?.deliveryRadiusKm ?? 5} km in about ${store?.deliveryEtaMinutes ?? 10} minutes`}
            />
            <div className="space-y-2 p-4">
              {addresses.map((a) => (
                <AddressOption key={a.id} address={a} selected={a.id === address?.id} onSelect={() => setAddress(a.id)} />
              ))}
              {addingAddress ? (
                <AddressForm
                  onSaved={(saved) => {
                    setAddress(saved.id);
                    setAddingAddress(false);
                  }}
                  onCancel={() => setAddingAddress(false)}
                />
              ) : (
                <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setAddingAddress(true)}>
                  Add a new address
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Pickup slot" subtitle={`Collect from the pickup counter at ${store?.name}, ${store?.addressLine}`} />
            <div className="p-4">
              <div className="flex gap-2">
                {slots.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDay(i)}
                    className={cn(
                      'rounded-xl px-4 py-2 text-sm font-semibold',
                      i === day ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots[day]?.slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setSlot(s.start)}
                    className={cn(
                      'rounded-xl border px-2 py-2.5 text-center text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      slot === s.start
                        ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    {formatTime(s.start)}
                    <span className="block text-[11px] font-medium text-slate-500">{s.available ? `${s.remaining} left` : 'Full'}</span>
                  </button>
                ))}
              </div>
              {slots.length === 0 && <p className="text-sm text-slate-500">Loading available slots…</p>}
            </div>
          </Card>
        )}

        {channel === 'DELIVERY' && (
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-900">Tip your delivery partner</p>
            <p className="text-xs text-slate-500">100% of the tip goes to the rider.</p>
            <div className="mt-3 flex gap-2">
              {[0, 1000, 2000, 3000, 5000].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTip(value)}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-semibold',
                    tip === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200',
                  )}
                >
                  {value === 0 ? 'No tip' : formatMoney(value)}
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Payment method" subtitle="Apple Pay, Google Pay, UPI, cards and PayPal" />
          <div className="p-4">
            <PaymentMethodPicker channel={channel} value={method} onChange={setMethod} />
          </div>
        </Card>

        <Field label={channel === 'DELIVERY' ? 'Delivery instructions' : 'Note for the store'}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={channel === 'DELIVERY' ? 'e.g. Leave at the door, ring the bell' : 'e.g. Ripe bananas please'}
            maxLength={300}
          />
        </Field>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4">
          <p className="text-sm font-bold text-slate-900">
            {cartTotals(lines).count} items from {store?.name}
          </p>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {lines.map((line) => (
              <li key={line.productId} className="flex items-center gap-3 text-sm">
                <ProductArt emoji={line.emoji} color={line.color} size="xs" />
                <span className="min-w-0 flex-1 truncate">{line.name}</span>
                <span className="text-slate-500">×{line.quantity}</span>
                <span className="tabular font-semibold">{formatMoney(line.price * line.quantity)}</span>
              </li>
            ))}
          </ul>
          {quote?.unavailable.map((u) => (
            <p key={u.productId} className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
              {u.name}: only {u.available} available. Update your cart.
            </p>
          ))}
          {quote?.offer && coupon && (
            <p className={cn('mt-3 text-sm font-semibold', quote.offer.applicable ? 'text-brand-700' : 'text-rose-600')}>
              {coupon}: {quote.offer.message}
            </p>
          )}
          {quote && <BillRows bill={quote.bill} />}
        </Card>
        <Button block size="lg" disabled={!ready} loading={place.isPending} onClick={() => place.mutate()}>
          {method?.method === 'CASH_ON_DELIVERY' ? 'Place order' : `Pay ${quote ? formatMoney(quote.bill.total) : ''}`}
        </Button>
        {!ready && (
          <p className="text-center text-xs text-slate-500">
            {channel === 'DELIVERY' && !address ? 'Add a delivery address. ' : ''}
            {channel === 'PICKUP' && !slot ? 'Pick a slot. ' : ''}
            {!method ? 'Choose how to pay.' : ''}
          </p>
        )}
        <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
          <Clock className="size-3.5" /> Prices and stock are confirmed when you place the order.
        </p>
      </aside>
      {sheet}
    </div>
  );
}

function AddressOption({ address, selected, onSelect }: { address: Address; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-3 text-left',
        selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-card">
        {address.label === 'HOME' ? <Home className="size-4" /> : <MapPin className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {address.label === 'HOME' ? 'Home' : address.label === 'WORK' ? 'Work' : 'Other'}
          {address.isDefault && <Badge tone="gray">Default</Badge>}
        </span>
        <span className="block text-sm text-slate-600">
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ''}, {address.city} {address.pincode}
        </span>
      </span>
    </button>
  );
}
