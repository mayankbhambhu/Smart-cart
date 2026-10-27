import {
  ALLERGENS,
  DIETARY_TAGS,
  DIETARY_TAG_META,
  PAYMENT_METHOD_LABELS,
  formatMoney,
  formatPhone,
  timeAgo,
  type Allergen,
  type AppNotification,
  type CustomerProfile,
  type DietaryTag,
  type SavedPaymentMethod,
} from '@smartcart/shared';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CreditCard, Home, LogOut, MapPin, Plus, Star, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Segmented,
  Select,
  Tabs,
} from '@/components/ui';
import { ApiError, customerApi, errorMessage, logout } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { AddressForm } from './AddressForm';
import { useAddresses, usePaymentsConfig, useProfile, useSavedMethods, useStores } from './hooks';
import { METHOD_ICONS } from './payment-methods';

type Section = 'profile' | 'addresses' | 'payments' | 'notifications';

export default function AccountPage() {
  const { data: profile, isLoading } = useProfile();
  const [section, setSection] = useState<Section>('profile');
  const navigate = useNavigate();
  if (isLoading || !profile) return <PageLoader />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={profile.user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-slate-900">{profile.user.name}</h1>
          <p className="truncate text-sm text-slate-500">
            {[profile.user.email, formatPhone(profile.user.phone)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="tabular text-lg font-extrabold text-slate-900">{profile.stats.orders}</p>
            <p className="text-xs text-slate-500">Orders</p>
          </div>
          <div>
            <p className="tabular text-lg font-extrabold text-brand-700">{formatMoney(profile.stats.totalSavings)}</p>
            <p className="text-xs text-slate-500">Saved</p>
          </div>
          <div>
            <p className="tabular text-lg font-extrabold text-amber-600">{profile.loyaltyPoints}</p>
            <p className="text-xs text-slate-500">Points</p>
          </div>
        </div>
        <Button
          variant="ghost"
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            await logout('CUSTOMER');
            navigate('/');
          }}
        >
          Log out
        </Button>
      </Card>

      <Tabs
        className="mt-6"
        value={section}
        onChange={setSection}
        tabs={[
          {
            value: 'profile',
            label: (
              <span className="flex items-center gap-1.5">
                <User className="size-4" /> Profile &amp; diet
              </span>
            ),
          },
          {
            value: 'addresses',
            label: (
              <span className="flex items-center gap-1.5">
                <Home className="size-4" /> Addresses
              </span>
            ),
          },
          {
            value: 'payments',
            label: (
              <span className="flex items-center gap-1.5">
                <CreditCard className="size-4" /> Payment methods
              </span>
            ),
          },
          {
            value: 'notifications',
            label: (
              <span className="flex items-center gap-1.5">
                <Bell className="size-4" /> Notifications
              </span>
            ),
          },
        ]}
      />
      <div className="mt-5">
        {section === 'profile' && <ProfileSection profile={profile} />}
        {section === 'addresses' && <AddressesSection />}
        {section === 'payments' && <PaymentsSection />}
        {section === 'notifications' && <NotificationsSection />}
      </div>
    </div>
  );
}

function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuth((s) => s.updateUser);
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => customerApi.patch<CustomerProfile>('/me/profile', patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile'], profile);
      updateUser('CUSTOMER', profile.user);
    },
    onError: (error) => toast.error('Could not save', errorMessage(error)),
  });
}

function ProfileSection({ profile }: { profile: CustomerProfile }) {
  const update = useUpdateProfile();
  const { data: stores = [] } = useStores();
  const [form, setForm] = useState({ name: profile.user.name, email: profile.user.email ?? '', phone: profile.user.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = form.name !== profile.user.name || form.email !== (profile.user.email ?? '') || form.phone !== (profile.user.phone ?? '');

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Personal details" />
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            update.mutate(
              { name: form.name, email: form.email || undefined, phone: form.phone || undefined },
              {
                onSuccess: () => toast.success('Profile updated'),
                onError: (error) => error instanceof ApiError && setErrors(error.fieldErrors),
              },
            );
          }}
        >
          <Field label="Full name" error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </Field>
          <Field label="Home store" hint="Used for prices, stock and aisle locations.">
            <Select value={profile.defaultStoreId ?? ''} onChange={(e) => update.mutate({ defaultStoreId: e.target.value || null })}>
              <option value="">Nearest store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={!dirty} loading={update.isPending}>
            Save changes
          </Button>
        </form>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Dietary preferences" subtitle="We highlight matching products and filter categories for you." />
          <div className="flex flex-wrap gap-2 p-5">
            {DIETARY_TAGS.map((tag: DietaryTag) => (
              <Chip
                key={tag}
                active={profile.dietaryPreferences.includes(tag)}
                onClick={() => update.mutate({ dietaryPreferences: toggle(profile.dietaryPreferences, tag) })}
              >
                {DIETARY_TAG_META[tag].emoji} {DIETARY_TAG_META[tag].label}
              </Chip>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Allergies" subtitle="Products containing these are flagged before you buy." />
          <div className="flex flex-wrap gap-2 p-5">
            {ALLERGENS.map((allergen: Allergen) => (
              <Chip
                key={allergen}
                active={profile.allergens.includes(allergen)}
                onClick={() => update.mutate({ allergens: toggle(profile.allergens, allergen) })}
                className={profile.allergens.includes(allergen) ? 'border-amber-500 bg-amber-50 text-amber-900' : undefined}
              >
                {allergen
                  .replace('_', ' ')
                  .toLowerCase()
                  .replace(/^\w/, (c) => c.toUpperCase())}
              </Chip>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AddressesSection() {
  const { data: addresses = [], isLoading } = useAddresses();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['addresses'] });
  const makeDefault = useMutation({
    mutationFn: (id: string) => customerApi.patch(`/me/addresses/${id}`, { isDefault: true }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => customerApi.delete(`/me/addresses/${id}`), onSuccess: refresh });
  if (isLoading) return <PageLoader />;
  return (
    <div className="space-y-3">
      {addresses.length === 0 && !adding && <EmptyState icon="🏠" title="No saved addresses" body="Add one to check out faster." />}
      {addresses.map((address) => (
        <Card key={address.id} className="flex items-start gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <MapPin className="size-5 text-slate-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              {address.label === 'HOME' ? 'Home' : address.label === 'WORK' ? 'Work' : 'Other'}
              {address.isDefault && <Badge tone="green">Default</Badge>}
            </p>
            <p className="text-sm text-slate-600">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
            </p>
            {address.landmark && <p className="text-xs text-slate-500">Near {address.landmark}</p>}
          </div>
          {!address.isDefault && (
            <Button variant="ghost" size="sm" onClick={() => makeDefault.mutate(address.id)}>
              Make default
            </Button>
          )}
          <IconButton label="Delete address" onClick={() => remove.mutate(address.id)} className="text-slate-400 hover:text-rose-600">
            <Trash2 className="size-4" />
          </IconButton>
        </Card>
      ))}
      {adding ? (
        <AddressForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Add address
        </Button>
      )}
    </div>
  );
}

function PaymentsSection() {
  const { data: methods = [], isLoading } = useSavedMethods();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
  const makeDefault = useMutation({
    mutationFn: (id: string) => customerApi.post(`/me/payment-methods/${id}/default`),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => customerApi.delete(`/me/payment-methods/${id}`), onSuccess: refresh });
  if (isLoading) return <PageLoader />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Saved methods make checkout one tap. Apple Pay and Google Pay use the wallet on your device, so there is nothing to save.
      </p>
      {methods.length === 0 && <EmptyState icon="💳" title="No saved payment methods" />}
      {methods.map((method: SavedPaymentMethod) => (
        <Card key={method.id} className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            {METHOD_ICONS[method.type]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              {method.label}
              {method.isDefault && <Badge tone="green">Default</Badge>}
            </p>
            <p className="text-xs text-slate-500">
              {PAYMENT_METHOD_LABELS[method.type]}
              {method.expMonth && method.expYear
                ? ` · expires ${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}`
                : ''}
              {method.provider === 'demo' ? ' · demo' : ''}
            </p>
          </div>
          {!method.isDefault && (
            <IconButton label="Make default" onClick={() => makeDefault.mutate(method.id)}>
              <Star className="size-4" />
            </IconButton>
          )}
          <IconButton label="Remove" onClick={() => remove.mutate(method.id)} className="text-slate-400 hover:text-rose-600">
            <Trash2 className="size-4" />
          </IconButton>
        </Card>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
        Add payment method
      </Button>
      <AddMethodModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          refresh();
          setAdding(false);
        }}
      />
    </div>
  );
}

function cardBrand(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(digits)) return 'RuPay';
  return 'Card';
}

function AddMethodModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'UPI' | 'CARD' | 'PAYPAL'>('UPI');
  const [upiId, setUpiId] = useState('');
  const [email, setEmail] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: config } = usePaymentsConfig();
  const stripeLive = Boolean(config?.stripePublishableKey);

  const save = useMutation({
    mutationFn: () => {
      if (type === 'UPI') return customerApi.post('/me/payment-methods', { type, upiId });
      if (type === 'PAYPAL') return customerApi.post('/me/payment-methods', { type, email });
      const digits = card.number.replace(/\D/g, '');
      const [mm, yy] = card.expiry.split('/').map((p) => Number(p.trim()));
      return customerApi.post('/me/payment-methods', {
        type,
        brand: cardBrand(digits),
        last4: digits.slice(-4),
        expMonth: mm,
        expYear: yy && yy < 100 ? 2000 + yy : yy,
        holderName: card.name || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Payment method saved');
      setUpiId('');
      setEmail('');
      setCard({ number: '', expiry: '', cvc: '', name: '' });
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save', errorMessage(error));
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Add a payment method">
      <Segmented
        value={type}
        onChange={(t) => {
          setType(t);
          setErrors({});
        }}
        options={[
          { value: 'UPI', label: 'UPI ID' },
          { value: 'CARD', label: 'Card' },
          { value: 'PAYPAL', label: 'PayPal' },
        ]}
      />
      <div className="mt-4">
        {type === 'CARD' && stripeLive ? (
          <StripeCardSetup onSaved={onSaved} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {type === 'UPI' && (
              <Field label="UPI ID" error={errors.upiId} hint="e.g. yourname@okhdfcbank, 98765xxxxx@ybl">
                <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@bank" autoFocus />
              </Field>
            )}
            {type === 'PAYPAL' && (
              <Field label="PayPal email" error={errors.email}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
            )}
            {type === 'CARD' && (
              <>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Demo mode: only the brand, last 4 digits and expiry are stored. Use 4242 4242 4242 4242.
                </p>
                <Field label="Card number" error={errors.last4}>
                  <Input
                    inputMode="numeric"
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })}
                    placeholder="4242 4242 4242 4242"
                    autoFocus
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expiry (MM/YY)" error={errors.expMonth ?? errors.expYear}>
                    <Input
                      value={card.expiry}
                      onChange={(e) => setCard({ ...card, expiry: e.target.value.slice(0, 7) })}
                      placeholder="12/29"
                    />
                  </Field>
                  <Field label="CVC">
                    <Input
                      inputMode="numeric"
                      value={card.cvc}
                      onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="123"
                    />
                  </Field>
                </div>
                <Field label="Name on card">
                  <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
                </Field>
              </>
            )}
            <Button type="submit" block loading={save.isPending}>
              Save
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}

/** Live mode: the card goes straight to Stripe through a SetupIntent; we only keep Stripe's reference. */
function StripeCardSetup({ onSaved }: { onSaved: () => void }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['stripe-setup'],
    queryFn: () => customerApi.post<{ clientSecret: string; publishableKey: string }>('/me/payment-methods/stripe-setup'),
    staleTime: 0,
    gcTime: 0,
  });
  const stripePromise = useMemo(() => (data ? loadStripe(data.publishableKey) : null), [data]);
  if (isLoading) return <PageLoader />;
  if (error || !data || !stripePromise) return <p className="text-sm text-rose-600">{errorMessage(error)}</p>;
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: data.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#0a8f45' } } }}
    >
      <StripeCardForm onSaved={onSaved} />
    </Elements>
  );
}

function StripeCardForm({ onSaved }: { onSaved: () => void }) {
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
        const result = await stripe.confirmSetup({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: `${window.location.origin}/account` },
        });
        if (result.error) {
          setError(result.error.message ?? 'Card could not be saved');
          setBusy(false);
          return;
        }
        const paymentMethod = result.setupIntent.payment_method;
        const id = typeof paymentMethod === 'string' ? paymentMethod : paymentMethod?.id;
        try {
          await customerApi.post('/me/payment-methods', { type: 'CARD', stripePaymentMethodId: id });
          toast.success('Card saved');
          onSaved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <PaymentElement />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" block loading={busy} disabled={!stripe}>
        Save card
      </Button>
    </form>
  );
}

function NotificationsSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'CUSTOMER'],
    queryFn: () => customerApi.get<{ items: AppNotification[]; unread: number }>('/me/notifications'),
  });
  const readAll = useMutation({
    mutationFn: () => customerApi.post('/me/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications', 'CUSTOMER'] }),
  });
  const { mutate: markAllRead } = readAll;
  const unread = data?.unread ?? 0;
  useEffect(() => {
    if (unread === 0) return;
    const timer = setTimeout(() => markAllRead(), 1500);
    return () => clearTimeout(timer);
  }, [unread, markAllRead]);
  if (isLoading) return <PageLoader />;
  if (!data || data.items.length === 0) return <EmptyState icon="🔔" title="No notifications yet" />;
  return (
    <Card className="divide-y divide-slate-100">
      {data.items.map((n) => (
        <div key={n.id} className={cn('flex gap-3 px-5 py-4', !n.readAt && 'bg-brand-50/50')}>
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{n.title}</p>
            <p className="text-sm text-slate-600">{n.body}</p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
        </div>
      ))}
    </Card>
  );
}
