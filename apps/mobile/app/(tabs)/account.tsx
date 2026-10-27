import {
  ALLERGENS,
  DIETARY_TAGS,
  DIETARY_TAG_META,
  PAYMENT_METHOD_LABELS,
  formatMoney,
  initials,
  timeAgo,
  type Allergen,
  type AppNotification,
  type CustomerProfile,
  type DietaryTag,
  type SavedPaymentMethod,
} from '@smartcart/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { initPaymentSheet, initStripe, presentPaymentSheet, retrieveSetupIntent } from '@stripe/stripe-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AddressForm } from '@/components/AddressForm';
import { colors, radius, space } from '@/components/theme';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  H1,
  IconButton,
  Loader,
  Muted,
  Row,
  Screen,
  Segmented,
  Sheet,
  type IconName,
} from '@/components/ui';
import { ApiError, customerApi, errorMessage, logout } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { STRIPE_MERCHANT_ID } from '@/lib/config';
import { useAddresses, usePaymentsConfig, useProfile, useSavedMethods, useStores } from '@/lib/hooks';
import { toast } from '@/lib/toast';

type Section = 'details' | 'diet' | 'addresses' | 'payments' | 'notifications';

/** Profile, dietary preferences, addresses, payment methods and notifications. */
export default function AccountScreen() {
  const router = useRouter();
  const session = useSession('CUSTOMER');
  const staff = useSession('STAFF');
  const queryClient = useQueryClient();
  const { data: profile, refetch, isRefetching } = useProfile();
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => customerApi.get<{ items: AppNotification[]; unread: number }>('/me/notifications'),
    enabled: Boolean(session),
  });
  const [open, setOpen] = useState<Section | null>(null);

  if (!session) {
    return (
      <Screen>
        <EmptyState
          emoji="👋"
          title="Welcome to SmartCart"
          body="Log in to save addresses and payment methods, share family lists and see your purchase history."
          action={<Button title="Log in or sign up" size="lg" onPress={() => router.push('/login')} />}
        />
        <Card style={{ marginTop: space.lg }}>
          <MenuRow
            icon="storefront-outline"
            title="Stores & stock"
            subtitle="Opening hours, directions, is it in stock?"
            onPress={() => router.push('/stores')}
          />
          <MenuRow
            icon="briefcase-outline"
            title="Staff mode"
            subtitle={staff ? `Signed in as ${staff.user.name}` : 'For store employees'}
            onPress={() => router.push('/staff')}
            last
          />
        </Card>
      </Screen>
    );
  }
  if (!profile) return <Loader />;

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <Row gap={space.md}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(profile.user.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <H1 numberOfLines={1}>{profile.user.name}</H1>
            <Muted numberOfLines={1}>{[profile.user.phone, profile.user.email].filter(Boolean).join(' · ')}</Muted>
          </View>
        </Row>
        <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
          <Stat label="Orders" value={String(profile.stats.orders)} />
          <Stat label="Spent" value={formatMoney(profile.stats.totalSpent)} />
          <Stat label="Saved" value={formatMoney(profile.stats.totalSavings)} green />
          <Stat label="Points" value={String(profile.loyaltyPoints)} />
        </Row>
      </Card>

      <Card style={{ marginTop: space.lg, paddingVertical: 4 }}>
        <MenuRow
          icon="person-outline"
          title="Personal details"
          subtitle="Name, email, phone and home store"
          onPress={() => setOpen('details')}
        />
        <MenuRow
          icon="leaf-outline"
          title="Dietary preferences"
          subtitle={
            profile.dietaryPreferences.length || profile.allergens.length
              ? [...profile.dietaryPreferences.map((t) => DIETARY_TAG_META[t].label), ...profile.allergens.map(allergenLabel)].join(', ')
              : 'Vegan, gluten-free, allergies…'
          }
          onPress={() => setOpen('diet')}
        />
        <MenuRow icon="home-outline" title="Addresses" subtitle="Where we deliver" onPress={() => setOpen('addresses')} />
        <MenuRow
          icon="card-outline"
          title="Payment methods"
          subtitle="UPI, cards and PayPal for one-tap checkout"
          onPress={() => setOpen('payments')}
        />
        <MenuRow
          icon="notifications-outline"
          title="Notifications"
          subtitle="Order updates, list changes and offers"
          badge={notifications?.unread ? String(notifications.unread) : undefined}
          onPress={() => setOpen('notifications')}
          last
        />
      </Card>

      <Card style={{ marginTop: space.lg, paddingVertical: 4 }}>
        <MenuRow
          icon="storefront-outline"
          title="Stores & stock"
          subtitle="Opening hours, directions, is it in stock?"
          onPress={() => router.push('/stores')}
        />
        <MenuRow
          icon="briefcase-outline"
          title="Staff mode"
          subtitle={staff ? `Signed in as ${staff.user.name}` : 'For store employees'}
          onPress={() => router.push('/staff')}
          last
        />
      </Card>

      <Button
        title="Log out"
        variant="ghost"
        icon="log-out-outline"
        style={{ marginTop: space.lg }}
        onPress={() =>
          Alert.alert('Log out?', 'Your cart stays on this phone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Log out',
              style: 'destructive',
              onPress: async () => {
                await logout('CUSTOMER');
                queryClient.clear();
                toast.success('Logged out');
              },
            },
          ])
        }
      />

      <DetailsSheet visible={open === 'details'} onClose={() => setOpen(null)} profile={profile} />
      <DietSheet visible={open === 'diet'} onClose={() => setOpen(null)} profile={profile} />
      <AddressesSheet visible={open === 'addresses'} onClose={() => setOpen(null)} />
      <PaymentsSheet visible={open === 'payments'} onClose={() => setOpen(null)} />
      <NotificationsSheet visible={open === 'notifications'} onClose={() => setOpen(null)} items={notifications?.items ?? []} />
    </Screen>
  );
}

function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: green ? colors.brand : colors.ink }}>{value}</Text>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  badge?: string;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, !last && styles.menuDivider, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15, color: colors.ink }}>{title}</Text>
        {subtitle && (
          <Muted numberOfLines={1} style={{ fontSize: 12 }}>
            {subtitle}
          </Muted>
        )}
      </View>
      {badge && <Badge label={badge} tone="red" />}
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function allergenLabel(allergen: Allergen): string {
  return allergen
    .replace('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
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

function DetailsSheet({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: CustomerProfile }) {
  const update = useUpdateProfile();
  const { data: stores = [] } = useStores();
  const [form, setForm] = useState({ name: profile.user.name, email: profile.user.email ?? '', phone: profile.user.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = form.name !== profile.user.name || form.email !== (profile.user.email ?? '') || form.phone !== (profile.user.phone ?? '');
  return (
    <Sheet visible={visible} onClose={onClose} title="Personal details">
      <Field
        label="Full name"
        value={form.name}
        onChangeText={(name) => setForm({ ...form, name })}
        error={errors.name}
        textContentType="name"
      />
      <Field
        label="Email"
        value={form.email}
        onChangeText={(email) => setForm({ ...form, email })}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label="Mobile number"
        value={form.phone}
        onChangeText={(phone) => setForm({ ...form, phone })}
        error={errors.phone}
        keyboardType="phone-pad"
        placeholder="+91 98765 43210"
      />
      <Button
        title="Save changes"
        disabled={!dirty}
        loading={update.isPending}
        onPress={() => {
          setErrors({});
          update.mutate(
            { name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined },
            {
              onSuccess: () => toast.success('Profile updated'),
              onError: (error) => error instanceof ApiError && setErrors(error.fieldErrors),
            },
          );
        }}
      />
      <Text style={[styles.label, { marginTop: space.xl }]}>Home store</Text>
      <Muted style={{ marginBottom: space.sm }}>Used for prices, stock and aisle locations.</Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Nearest store" active={!profile.defaultStoreId} onPress={() => update.mutate({ defaultStoreId: null })} />
        {stores.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            active={profile.defaultStoreId === s.id}
            onPress={() => update.mutate({ defaultStoreId: s.id })}
          />
        ))}
      </Row>
    </Sheet>
  );
}

function DietSheet({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: CustomerProfile }) {
  const update = useUpdateProfile();
  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return (
    <Sheet visible={visible} onClose={onClose} title="Dietary preferences">
      <Muted style={{ marginBottom: space.md }}>We highlight matching products and filter categories for you.</Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        {DIETARY_TAGS.map((tag: DietaryTag) => (
          <Chip
            key={tag}
            label={`${DIETARY_TAG_META[tag].emoji} ${DIETARY_TAG_META[tag].label}`}
            active={profile.dietaryPreferences.includes(tag)}
            onPress={() => update.mutate({ dietaryPreferences: toggle(profile.dietaryPreferences, tag) })}
          />
        ))}
      </Row>
      <Text style={[styles.label, { marginTop: space.xl }]}>Allergies</Text>
      <Muted style={{ marginBottom: space.md }}>Products containing these are flagged before you buy.</Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        {ALLERGENS.map((allergen: Allergen) => (
          <Chip
            key={allergen}
            label={allergenLabel(allergen)}
            active={profile.allergens.includes(allergen)}
            onPress={() => update.mutate({ allergens: toggle(profile.allergens, allergen) })}
          />
        ))}
      </Row>
    </Sheet>
  );
}

function AddressesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data: addresses = [], isLoading } = useAddresses();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['addresses'] });
  const makeDefault = useMutation({
    mutationFn: (id: string) => customerApi.patch(`/me/addresses/${id}`, { isDefault: true }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => customerApi.delete(`/me/addresses/${id}`), onSuccess: refresh });
  return (
    <Sheet visible={visible} onClose={onClose} title="Addresses">
      {isLoading && <Loader />}
      <View style={{ gap: space.md }}>
        {addresses.map((a) => (
          <Card key={a.id}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>
                    {a.label === 'HOME' ? 'Home' : a.label === 'WORK' ? 'Work' : 'Other'}
                  </Text>
                  {a.isDefault && <Badge label="Default" tone="green" />}
                </Row>
                <Muted>
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ''}
                  {a.landmark ? ` (near ${a.landmark})` : ''}, {a.city} {a.pincode}
                </Muted>
              </View>
              {!a.isDefault && <IconButton name="star-outline" label="Make default" onPress={() => makeDefault.mutate(a.id)} />}
              <IconButton name="trash-outline" label="Remove" color={colors.faint} onPress={() => remove.mutate(a.id)} />
            </Row>
          </Card>
        ))}
        {adding ? (
          <AddressForm
            onSaved={() => {
              setAdding(false);
              toast.success('Address saved');
            }}
          />
        ) : (
          <Button title="Add a new address" icon="add" variant="outline" onPress={() => setAdding(true)} />
        )}
      </View>
    </Sheet>
  );
}

const METHOD_ICONS: Record<SavedPaymentMethod['type'], IconName> = {
  UPI: 'phone-portrait-outline',
  CARD: 'card-outline',
  APPLE_PAY: 'logo-apple',
  GOOGLE_PAY: 'logo-google',
  PAYPAL: 'wallet-outline',
  CASH_ON_DELIVERY: 'cash-outline',
};

function PaymentsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data: methods = [], isLoading } = useSavedMethods();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
  const makeDefault = useMutation({
    mutationFn: (id: string) => customerApi.post(`/me/payment-methods/${id}/default`),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => customerApi.delete(`/me/payment-methods/${id}`), onSuccess: refresh });
  return (
    <Sheet visible={visible} onClose={onClose} title="Payment methods">
      <Muted style={{ marginBottom: space.md }}>
        Saved methods make checkout one tap. Apple Pay and Google Pay use the wallet on this phone, so there is nothing to save.
      </Muted>
      {isLoading && <Loader />}
      <View style={{ gap: space.md }}>
        {!isLoading && methods.length === 0 && <EmptyState emoji="💳" title="No saved payment methods" />}
        {methods.map((method) => (
          <Card key={method.id}>
            <Row gap={space.md}>
              <View style={styles.methodIcon}>
                <Ionicons name={METHOD_ICONS[method.type]} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Row>
                  <Text style={{ fontWeight: '700', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                    {method.label}
                  </Text>
                  {method.isDefault && <Badge label="Default" tone="green" />}
                </Row>
                <Muted style={{ fontSize: 12 }}>
                  {PAYMENT_METHOD_LABELS[method.type]}
                  {method.expMonth && method.expYear
                    ? ` · expires ${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}`
                    : ''}
                  {method.provider === 'demo' ? ' · demo' : ''}
                </Muted>
              </View>
              {!method.isDefault && <IconButton name="star-outline" label="Make default" onPress={() => makeDefault.mutate(method.id)} />}
              <IconButton name="trash-outline" label="Remove" color={colors.faint} onPress={() => remove.mutate(method.id)} />
            </Row>
          </Card>
        ))}
        {adding ? (
          <AddMethod
            onSaved={() => {
              refresh();
              setAdding(false);
            }}
          />
        ) : (
          <Button title="Add payment method" icon="add" variant="outline" onPress={() => setAdding(true)} />
        )}
      </View>
    </Sheet>
  );
}

function cardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(digits)) return 'RuPay';
  return 'Card';
}

function AddMethod({ onSaved }: { onSaved: () => void }) {
  const [type, setType] = useState<'UPI' | 'CARD' | 'PAYPAL'>('UPI');
  const [upiId, setUpiId] = useState('');
  const [email, setEmail] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: config } = usePaymentsConfig();
  const stripeLive = Boolean(config?.stripePublishableKey);

  const save = useMutation({
    mutationFn: async () => {
      if (type === 'UPI') return customerApi.post('/me/payment-methods', { type, upiId: upiId.trim() });
      if (type === 'PAYPAL') return customerApi.post('/me/payment-methods', { type, email: email.trim() });
      if (stripeLive) {
        // Card details go straight to Stripe in its PaymentSheet; we only keep the payment method id.
        const setup = await customerApi.post<{ clientSecret: string; publishableKey: string }>('/me/payment-methods/stripe-setup');
        await initStripe({ publishableKey: setup.publishableKey, merchantIdentifier: STRIPE_MERCHANT_ID, urlScheme: 'smartcart' });
        const init = await initPaymentSheet({
          setupIntentClientSecret: setup.clientSecret,
          merchantDisplayName: config?.merchantDisplayName ?? 'SmartCart',
        });
        if (init.error) throw new Error(init.error.message);
        const result = await presentPaymentSheet();
        if (result.error) {
          if (result.error.code === 'Canceled') return null;
          throw new Error(result.error.message);
        }
        const { setupIntent, error } = await retrieveSetupIntent(setup.clientSecret);
        if (error || !setupIntent?.paymentMethodId) throw new Error(error?.message ?? 'The card could not be saved');
        return customerApi.post('/me/payment-methods', { type: 'CARD', stripePaymentMethodId: setupIntent.paymentMethodId });
      }
      // Demo mode: only the brand, last four digits and expiry leave the phone.
      const digits = card.number.replace(/\D/g, '');
      const [mm, yy] = card.expiry.split('/').map((p) => Number(p.trim()));
      return customerApi.post('/me/payment-methods', {
        type,
        brand: cardBrand(digits),
        last4: digits.slice(-4),
        expMonth: mm,
        expYear: yy && yy < 100 ? 2000 + yy : yy,
        holderName: card.name.trim() || undefined,
      });
    },
    onSuccess: (saved) => {
      if (saved === null) return;
      toast.success('Payment method saved');
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save', errorMessage(error));
    },
  });

  let form: ReactNode;
  if (type === 'UPI') {
    form = (
      <Field
        label="UPI ID"
        value={upiId}
        onChangeText={setUpiId}
        autoCapitalize="none"
        placeholder="yourname@okicici"
        error={errors.upiId}
      />
    );
  } else if (type === 'PAYPAL') {
    form = (
      <Field
        label="PayPal email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
      />
    );
  } else if (stripeLive) {
    form = (
      <Muted style={{ marginBottom: space.md }}>
        You will enter the card in Stripe's secure form. SmartCart never sees the card number.
      </Muted>
    );
  } else {
    form = (
      <>
        <Field
          label="Card number"
          value={card.number}
          onChangeText={(number) => setCard({ ...card, number })}
          keyboardType="number-pad"
          maxLength={19}
          placeholder="4242 4242 4242 4242"
          error={errors.last4}
        />
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              label="Expiry"
              value={card.expiry}
              onChangeText={(expiry) => setCard({ ...card, expiry })}
              placeholder="MM/YY"
              maxLength={5}
              error={errors.expMonth ?? errors.expYear}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Field label="Name on card" value={card.name} onChangeText={(name) => setCard({ ...card, name })} />
          </View>
        </Row>
        <Muted style={{ fontSize: 12, marginBottom: space.md }}>Demo mode: only the brand and last four digits are stored.</Muted>
      </>
    );
  }

  return (
    <Card style={{ gap: space.md }}>
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
      <View>{form}</View>
      <Button title={type === 'CARD' && stripeLive ? 'Add card securely' : 'Save'} loading={save.isPending} onPress={() => save.mutate()} />
    </Card>
  );
}

function NotificationsSheet({ visible, onClose, items }: { visible: boolean; onClose: () => void; items: AppNotification[] }) {
  const queryClient = useQueryClient();
  const readAll = useMutation({
    mutationFn: () => customerApi.post('/me/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Notifications">
      {items.some((n) => !n.readAt) && (
        <Button
          title="Mark all as read"
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-end' }}
          loading={readAll.isPending}
          onPress={() => readAll.mutate()}
        />
      )}
      {items.length === 0 && <EmptyState emoji="🔔" title="You're all caught up" />}
      <View style={{ gap: space.sm }}>
        {items.map((n) => (
          <View
            key={n.id}
            style={[styles.notification, !n.readAt && { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}
          >
            <Text style={{ fontWeight: '700', color: colors.ink }}>{n.title}</Text>
            <Muted>{n.body}</Muted>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{timeAgo(n.createdAt)}</Muted>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notification: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
});
