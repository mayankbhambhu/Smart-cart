import { formatMoney, PAYMENT_METHOD_LABELS, type Bill, type OrderChannel, type PaymentMethodType } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePaymentsConfig, useSavedMethods } from '@/lib/hooks';
import { colors, radius, space } from './theme';
import { Badge, Muted, Row, type IconName } from './ui';

export function BillRows({ bill }: { bill: Bill }) {
  const rows: [string, number, boolean?][] = [
    ['Items total', bill.itemTotal],
    ...(bill.couponDiscount > 0 ? ([['Coupon discount', -bill.couponDiscount, true]] as [string, number, boolean][]) : []),
    ...(bill.deliveryFee > 0 ? ([['Delivery fee', bill.deliveryFee]] as [string, number][]) : []),
    ...(bill.handlingFee > 0 ? ([['Handling charge', bill.handlingFee]] as [string, number][]) : []),
    ...(bill.smallCartFee > 0 ? ([['Small cart fee', bill.smallCartFee]] as [string, number][]) : []),
    ...(bill.tip > 0 ? ([['Rider tip', bill.tip]] as [string, number][]) : []),
  ];
  return (
    <View style={{ gap: 6 }}>
      {bill.mrpTotal > bill.itemTotal && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>MRP total</Muted>
          <Muted style={{ textDecorationLine: 'line-through' }}>{formatMoney(bill.mrpTotal)}</Muted>
        </Row>
      )}
      {rows.map(([label, value, green]) => (
        <Row key={label} style={{ justifyContent: 'space-between' }}>
          <Text style={[styles.row, green && { color: colors.brand }]}>{label}</Text>
          <Text style={[styles.row, green && { color: colors.brand }]}>{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</Text>
        </Row>
      ))}
      <Row
        style={{ justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 }}
      >
        <Text style={styles.total}>Grand total</Text>
        <Text style={styles.total}>{formatMoney(bill.total)}</Text>
      </Row>
      <Muted style={{ fontSize: 11 }}>Includes {formatMoney(bill.taxIncluded)} GST</Muted>
    </View>
  );
}

export interface MethodChoice {
  method: PaymentMethodType;
  savedPaymentMethodId?: string;
}

const ICONS: Record<PaymentMethodType, IconName> = {
  UPI: 'phone-portrait-outline',
  CARD: 'card-outline',
  APPLE_PAY: 'logo-apple',
  GOOGLE_PAY: 'logo-google',
  PAYPAL: 'wallet-outline',
  CASH_ON_DELIVERY: 'cash-outline',
};

/** Methods the API allows for the channel; Apple Pay only on iOS and Google Pay only on Android. */
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
  const methods = (config?.methods ?? []).filter(
    (m) =>
      m.channels.includes(channel) &&
      !(m.method === 'APPLE_PAY' && Platform.OS !== 'ios' && m.live) &&
      !(m.method === 'GOOGLE_PAY' && Platform.OS !== 'android' && m.live) &&
      !(m.method === 'PAYPAL' && m.live && channel === 'IN_STORE'),
  );
  return (
    <View style={{ gap: space.sm }}>
      {methods.map(({ method, live }) => {
        const selected = value?.method === method && !value.savedPaymentMethodId;
        return (
          <View key={method} style={{ gap: 6 }}>
            <Pressable onPress={() => onChange({ method })} style={[styles.method, selected && styles.selected]}>
              <Ionicons name={ICONS[method]} size={22} color={colors.text} />
              <Text style={styles.methodLabel}>{PAYMENT_METHOD_LABELS[method]}</Text>
              {!live && method !== 'CASH_ON_DELIVERY' && <Badge label="Demo" tone="yellow" />}
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.brand : colors.faint} />
            </Pressable>
            {saved
              .filter((s) => s.type === method)
              .map((s) => {
                const active = value?.savedPaymentMethodId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => onChange({ method, savedPaymentMethodId: s.id })}
                    style={[styles.saved, active && styles.selected]}
                  >
                    <Text style={{ flex: 1, color: colors.text }}>{s.label}</Text>
                    {s.isDefault && <Badge label="Default" />}
                  </Pressable>
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { fontSize: 14, color: colors.text },
  total: { fontSize: 16, fontWeight: '800', color: colors.ink },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  methodLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 24,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
});
