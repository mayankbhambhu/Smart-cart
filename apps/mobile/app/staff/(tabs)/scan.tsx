import {
  describeLocation,
  formatMoney,
  pluralize,
  STOCK_STATUS_LABELS,
  type GateVerifyResult,
  type InventoryRow,
  type Order,
} from '@smartcart/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScannerModal } from '@/components/Scanner';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, Field, Loader, Muted, ProductArt, Row, Screen, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useStaff, type StaffContext } from '@/lib/staff';
import { toast } from '@/lib/toast';

type Mode = 'exit' | 'pickup' | 'product';

const MODES: Record<Mode, { title: string; hint: string; manual: string; button: string }> = {
  exit: {
    title: 'Check an exit pass',
    hint: "Scan the QR or barcode on the shopper's receipt",
    manual: 'Or type the receipt code (SC…)',
    button: 'Scan exit pass',
  },
  pickup: {
    title: 'Verify a pickup',
    hint: "Scan the pickup QR in the customer's app",
    manual: 'Or type the scanned text',
    button: 'Scan pickup QR',
  },
  product: {
    title: 'Look up a product',
    hint: 'Scan the barcode on the pack or shelf label',
    manual: 'Or type a barcode or name',
    button: 'Scan product',
  },
};

/** The employee's phone as a handheld: exit gate check, pickup hand-over and product / stock look-up. */
export default function StaffScanScreen() {
  const staff = useStaff();
  const [mode, setMode] = useState<Mode>('exit');
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  if (!staff) return <Loader />;
  const config = MODES[mode];
  return (
    <Screen>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setLastCode(null);
        }}
        options={[
          { value: 'exit', label: 'Exit pass' },
          { value: 'pickup', label: 'Pickup' },
          { value: 'product', label: 'Product' },
        ]}
      />
      <Button title={config.button} icon="scan" size="lg" style={{ marginTop: space.lg }} onPress={() => setScanning(true)} />
      <View style={{ marginTop: space.lg }}>
        {mode === 'exit' && <ExitCheck staff={staff} code={lastCode} />}
        {mode === 'pickup' && <PickupCheck staff={staff} code={lastCode} />}
        {mode === 'product' && <ProductLookup staff={staff} code={lastCode} />}
      </View>
      <ScannerModal
        visible={scanning}
        onClose={() => setScanning(false)}
        title={config.title}
        hint={config.hint}
        manualPlaceholder={config.manual}
        onScan={(code) => {
          setScanning(false);
          // A fresh object each time so scanning the same code again re-runs the check.
          setLastCode(`${code}\u0000${Date.now()}`);
        }}
      />
    </Screen>
  );
}

const scanned = (code: string | null) => (code ? code.split('\u0000')[0]! : null);

/** Runs the check once for every new scan. */
function useOnCode(code: string | null, run: (value: string) => void) {
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (code) runRef.current(scanned(code)!);
  }, [code]);
}

function ExitCheck({ staff, code }: { staff: StaffContext; code: string | null }) {
  const verify = useMutation({
    mutationFn: (value: string) => staff.post<GateVerifyResult>('/gate/verify', { code: value }),
    onSuccess: (result) =>
      void Haptics.notificationAsync(result.open ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error),
    onError: (error) => toast.error('Could not check the pass', errorMessage(error)),
  });
  useOnCode(code, (value) => verify.mutate(value));
  const result = verify.data;
  if (verify.isPending) return <Loader label="Checking the payment…" />;
  if (!result) return <Muted style={{ textAlign: 'center' }}>Each pass opens the gate once. A used or unpaid receipt is refused.</Muted>;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={[styles.verdict, { backgroundColor: result.open ? colors.brand : colors.danger }]}>
        <Ionicons name={result.open ? 'checkmark-circle' : 'close-circle'} size={56} color="#fff" />
        <Text style={styles.verdictTitle}>{result.open ? 'OK to exit' : 'Do not let through'}</Text>
        <Text style={styles.verdictBody}>{result.message}</Text>
      </View>
      {result.order && (
        <View style={{ padding: space.lg, gap: 4 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>{result.order.customerName}</Text>
          <Muted>
            {result.order.orderNumber} · {pluralize(result.order.itemCount, 'item')} · {formatMoney(result.order.total)}
            {result.order.paidAt ? ` · paid ${formatTime(result.order.paidAt)}` : ''}
          </Muted>
        </View>
      )}
    </Card>
  );
}

function PickupCheck({ staff, code }: { staff: StaffContext; code: string | null }) {
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const verify = useMutation({
    mutationFn: (input: { scanned?: string; orderNumber?: string; pickupCode?: string }) =>
      staff.post<Order>('/orders/verify-pickup', input),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['staff-orders', staff.storeId] });
      setOrderNumber('');
      setPickupCode('');
    },
    onError: (error) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error('Pickup not verified', errorMessage(error));
    },
  });
  useOnCode(code, (value) => verify.mutate({ scanned: value }));
  const order = verify.data;
  return (
    <View style={{ gap: space.lg }}>
      {verify.isPending && <Loader label="Verifying…" />}
      {order && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={[styles.verdict, { backgroundColor: colors.brand }]}>
            <Ionicons name="bag-check" size={52} color="#fff" />
            <Text style={styles.verdictTitle}>Hand over the bag</Text>
            <Text style={styles.verdictBody}>
              {order.orderNumber} · {pluralize(order.itemCount, 'item')} for {order.customer?.name ?? 'the customer'}
            </Text>
          </View>
        </Card>
      )}
      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: space.md }}>Or enter it by hand</Text>
        <Field
          label="Order number"
          value={orderNumber}
          onChangeText={(t) => setOrderNumber(t.toUpperCase())}
          autoCapitalize="characters"
          placeholder="SC-24101-0042"
        />
        <Field
          label="Pickup code"
          value={pickupCode}
          onChangeText={(t) => setPickupCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={8}
        />
        <Button
          title="Verify & hand over"
          disabled={!orderNumber || pickupCode.length < 4}
          loading={verify.isPending}
          onPress={() => verify.mutate({ orderNumber, pickupCode })}
        />
      </Card>
    </View>
  );
}

function ProductLookup({ staff, code }: { staff: StaffContext; code: string | null }) {
  const [q, setQ] = useState('');
  const lookup = useMutation({
    mutationFn: (value: string) => staff.get<{ items: InventoryRow[] }>('/inventory', { q: value, limit: 5, sort: 'name' }),
    onError: (error) => toast.error('Look-up failed', errorMessage(error)),
  });
  useOnCode(code, (value) => {
    setQ(value);
    lookup.mutate(value);
  });
  return (
    <View style={{ gap: space.md }}>
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            value={q}
            onChangeText={setQ}
            placeholder="Barcode, SKU or name"
            returnKeyType="search"
            onSubmitEditing={() => q.trim() && lookup.mutate(q.trim())}
          />
        </View>
        <Button
          title="Find"
          variant="dark"
          style={{ marginBottom: space.md }}
          disabled={!q.trim()}
          onPress={() => lookup.mutate(q.trim())}
        />
      </Row>
      {lookup.isPending && <Loader />}
      {lookup.data?.items.length === 0 && <Muted style={{ textAlign: 'center' }}>No product in this store matches “{q}”.</Muted>}
      {lookup.data?.items.map((row) => (
        <StockCard key={row.storeProductId} row={row} staff={staff} onChanged={() => lookup.mutate(q.trim())} />
      ))}
    </View>
  );
}

function StockCard({ row, staff, onChanged }: { row: InventoryRow; staff: StaffContext; onChanged: () => void }) {
  const [quantity, setQuantity] = useState(String(Math.max(0, Math.min(row.storageQty, row.restockTarget - row.shelfQty))));
  const restock = useMutation({
    mutationFn: () =>
      staff.post<{ shelfQty: number; storageQty: number }>(`/inventory/${row.storeProductId}/restock`, { quantity: Number(quantity) }),
    onSuccess: (result) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success('Moved to the shelf', `${row.name}: ${result.shelfQty} on the shelf, ${result.storageQty} in storage`);
      onChanged();
    },
    onError: (error) => toast.error('Could not restock', errorMessage(error)),
  });
  const tone = row.stockStatus === 'IN_STOCK' ? 'green' : row.stockStatus === 'LOW_STOCK' ? 'yellow' : 'red';
  return (
    <Card style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <ProductArt emoji={row.emoji} color={row.color} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={2}>
            {row.name}
          </Text>
          <Muted style={{ fontSize: 12 }}>
            {row.brand} · {row.unit} · {formatMoney(row.price)} · {row.barcode}
          </Muted>
        </View>
        <Badge label={STOCK_STATUS_LABELS[row.stockStatus]} tone={tone} />
      </Row>
      <View style={styles.where}>
        <Ionicons name="location" size={16} color={colors.info} />
        <Text style={{ fontWeight: '800', color: colors.info, flex: 1 }}>{describeLocation(row.location, { withLabel: true })}</Text>
      </View>
      <Row style={{ justifyContent: 'space-around', paddingVertical: space.sm }}>
        <Figure label="On shelf" value={row.shelfQty} warn={row.shelfQty <= row.reorderThreshold} />
        <Figure label="Storage" value={row.storageQty} />
        <Figure label="Threshold" value={row.reorderThreshold} />
        <Figure label="Target" value={row.restockTarget} />
      </Row>
      {row.storageQty > 0 && (
        <Row>
          <View style={{ flex: 1 }}>
            <Field value={quantity} onChangeText={(t) => setQuantity(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <Button
            title="Move to shelf"
            icon="arrow-up-circle-outline"
            style={{ marginBottom: space.md }}
            disabled={!Number(quantity) || Number(quantity) > row.storageQty}
            loading={restock.isPending}
            onPress={() => restock.mutate()}
          />
        </Row>
      )}
    </Card>
  );
}

function Figure({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: warn ? colors.warning : colors.ink }}>{value}</Text>
      <Muted style={{ fontSize: 11 }}>{label}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  verdict: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: space.lg, gap: 4 },
  verdictTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  verdictBody: { color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: space.sm,
  },
});
