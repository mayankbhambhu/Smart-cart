import { SocketEvents, describeLocation, timeAgo, type RestockAlert } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, EmptyState, Field, Loader, Muted, ProductArt, Row, Segmented, Sheet } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useLiveInvalidate, useStaff, useStoreRoom, type StaffContext } from '@/lib/staff';
import { useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';

/**
 * Shelves that dropped below their threshold, live: smart-cart drops and
 * sales deduct stock instantly and the alert appears here for the restock team.
 */
export default function StaffAlertsScreen() {
  const staff = useStaff();
  const [view, setView] = useState<'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [resolving, setResolving] = useState<RestockAlert | null>(null);
  useStoreRoom(staff?.storeId);
  useLiveInvalidate(SocketEvents.ALERT_CHANGED, [['staff-alerts', staff?.storeId]], 500);
  // The broadcast carries the alert itself; a new or escalated one buzzes the restock team.
  useSocketEvent<RestockAlert>('STAFF', SocketEvents.ALERT_CHANGED, (alert) => {
    if (alert.status === 'OPEN') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  });
  const {
    data: alerts = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['staff-alerts', staff?.storeId, view],
    queryFn: () => staff!.get<RestockAlert[]>('/alerts', { status: view, limit: 100 }),
    enabled: Boolean(staff),
  });
  if (!staff) return <Loader />;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'ACTIVE', label: 'Needs restock' },
              { value: 'RESOLVED', label: 'Done' },
            ]}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <Loader />
          ) : (
            <EmptyState emoji="✅" title={view === 'ACTIVE' ? 'Every shelf is above its threshold' : 'No restocks yet today'} />
          )
        }
        renderItem={({ item }) => <AlertCard alert={item} staff={staff} onResolve={() => setResolving(item)} />}
      />
      {resolving && <ResolveSheet alert={resolving} staff={staff} onClose={() => setResolving(null)} />}
    </View>
  );
}

function AlertCard({ alert, staff, onResolve }: { alert: RestockAlert; staff: StaffContext; onResolve: () => void }) {
  const queryClient = useQueryClient();
  const acknowledge = useMutation({
    mutationFn: () => staff.post<RestockAlert>(`/alerts/${alert.id}/acknowledge`),
    onSuccess: () => {
      toast.success("You're on it", `${alert.product.name} · ${describeLocation(alert.location)}`);
      void queryClient.invalidateQueries({ queryKey: ['staff-alerts', staff.storeId] });
    },
    onError: (error) => toast.error('Could not take the alert', errorMessage(error)),
  });
  const out = alert.level === 'OUT_OF_STOCK';
  return (
    <Card style={out && alert.status !== 'RESOLVED' ? { borderColor: '#fecdd3' } : undefined}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <ProductArt emoji={alert.product.emoji} color={alert.product.color} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={2}>
            {alert.product.name}
          </Text>
          <Text style={{ fontWeight: '800', color: colors.info }}>{describeLocation(alert.location, { withLabel: true })}</Text>
          <Muted style={{ fontSize: 12 }}>
            Shelf {alert.shelfQty} · storage {alert.storageQty} · threshold {alert.threshold} · {timeAgo(alert.createdAt)}
          </Muted>
        </View>
        <Badge
          label={
            alert.status === 'RESOLVED'
              ? `+${alert.restockedQty ?? 0} restocked`
              : out
                ? 'Empty shelf'
                : alert.status === 'ACKNOWLEDGED'
                  ? 'In progress'
                  : 'Low'
          }
          tone={alert.status === 'RESOLVED' ? 'green' : out ? 'red' : 'yellow'}
        />
      </Row>
      {alert.needsReorder && alert.status !== 'RESOLVED' && (
        <Text style={styles.reorder}>Storage is low too: a supplier reorder is needed.</Text>
      )}
      {alert.status !== 'RESOLVED' && (
        <Row style={{ marginTop: space.md }}>
          {alert.status === 'OPEN' && (
            <Button title="I'll do it" size="sm" variant="outline" loading={acknowledge.isPending} onPress={() => acknowledge.mutate()} />
          )}
          <Button title="Restocked" size="sm" icon="checkmark-done" onPress={onResolve} />
        </Row>
      )}
    </Card>
  );
}

function ResolveSheet({ alert, staff, onClose }: { alert: RestockAlert; staff: StaffContext; onClose: () => void }) {
  const queryClient = useQueryClient();
  const suggested = Math.max(0, Math.min(alert.storageQty, alert.restockTarget - alert.shelfQty));
  const [quantity, setQuantity] = useState(String(suggested));
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: () =>
      staff.post<RestockAlert>(`/alerts/${alert.id}/resolve`, { restockQuantity: Number(quantity) || 0, note: note.trim() || undefined }),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success('Shelf restocked', `${alert.product.name}: +${Number(quantity) || 0}`);
      void queryClient.invalidateQueries({ queryKey: ['staff-alerts', staff.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not restock', errorMessage(error)),
  });
  return (
    <Sheet visible onClose={onClose} title="Restock and close">
      <Text style={{ fontWeight: '700', color: colors.ink }}>{alert.product.name}</Text>
      <Muted style={{ marginBottom: space.md }}>{describeLocation(alert.location, { withLabel: true })}</Muted>
      <Text style={{ color: colors.text, marginBottom: space.md }}>
        Shelf has <Text style={{ fontWeight: '800' }}>{alert.shelfQty}</Text>, storage has{' '}
        <Text style={{ fontWeight: '800' }}>{alert.storageQty}</Text>. Fill to {alert.restockTarget}.
      </Text>
      {alert.storageQty === 0 && <Text style={styles.empty}>Storage is empty. Close the alert with 0 and raise a supplier reorder.</Text>}
      <Field
        label="Units moved to the shelf"
        value={quantity}
        onChangeText={(t) => setQuantity(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        autoFocus
      />
      <Field label="Note (optional)" value={note} onChangeText={setNote} />
      <Button
        title="Done"
        size="lg"
        icon="checkmark-done"
        loading={resolve.isPending}
        disabled={Number(quantity) > alert.storageQty}
        onPress={() => resolve.mutate()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reorder: {
    marginTop: space.sm,
    fontSize: 12,
    color: colors.violet,
    backgroundColor: colors.violetSoft,
    padding: space.sm,
    borderRadius: radius.sm,
  },
  empty: {
    fontSize: 13,
    color: colors.violet,
    backgroundColor: colors.violetSoft,
    padding: space.md,
    borderRadius: radius.md,
    marginBottom: space.md,
  },
});
