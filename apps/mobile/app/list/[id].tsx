import {
  SocketEvents,
  formatMoney,
  initials,
  timeAgo,
  type CatalogProduct,
  type ListItem,
  type ListUpdateEvent,
  type ShoppingList,
} from '@smartcart/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LocationTag } from '@/components/product';
import { ProductFinder } from '@/components/ProductFinder';
import { colors, radius, space } from '@/components/theme';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  H1,
  H2,
  IconButton,
  Loader,
  Muted,
  ProductArt,
  Row,
  Screen,
  Segmented,
  Sheet,
  Stepper,
} from '@/components/ui';
import { customerApi, errorMessage, publicApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useCurrentStore } from '@/lib/hooks';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { useCart, useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

type SortMode = 'aisle' | 'recent';

/** One family list, live: everyone's changes appear instantly with this store's prices and aisles. */
export default function ListScreen() {
  const { id: listId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession('CUSTOMER');
  const { store } = useCurrentStore();
  const storeId = store?.id;
  const queryClient = useQueryClient();
  const key = ['list', listId, storeId];
  const {
    data: list,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: key,
    queryFn: () => customerApi.get<ShoppingList>(`/lists/${listId}`, { storeId }),
    enabled: Boolean(storeId),
  });
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortMode>('aisle');
  const [sharing, setSharing] = useState(false);

  useRoom('CUSTOMER', SocketEvents.JOIN_LIST, SocketEvents.LEAVE_LIST, listId);
  useSocketEvent<ListUpdateEvent>('CUSTOMER', SocketEvents.LIST_UPDATED, (event) => {
    if (event.listId !== listId) return;
    if (event.action === 'LIST_DELETED') {
      toast.info('This list was deleted');
      router.back();
      return;
    }
    // Apply the change instantly, then refetch so prices and aisle locations match this store.
    queryClient.setQueryData<ShoppingList>(key, (current) => (current ? applyEvent(current, event) : current));
    if (event.item && event.actor.id !== session?.user.id) {
      const itemId = event.item.id;
      void Haptics.selectionAsync();
      setFlash((s) => new Set(s).add(itemId));
      setTimeout(
        () =>
          setFlash((s) => {
            const next = new Set(s);
            next.delete(itemId);
            return next;
          }),
        1500,
      );
    }
    void queryClient.invalidateQueries({ queryKey: ['list', listId] });
    void queryClient.invalidateQueries({ queryKey: ['lists'] });
  });

  const addItem = useMutation({
    mutationFn: (input: { productId?: string; name?: string }) =>
      customerApi.post<ListItem>(`/lists/${listId}/items`, { ...input, quantity: 1 }, { storeId }),
    onSuccess: (item) => {
      queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, item) : current));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast.error('Could not add the item', errorMessage(error)),
  });
  const updateItem = useMutation({
    mutationFn: ({ item, patch }: { item: ListItem; patch: { quantity?: number; isChecked?: boolean } }) =>
      customerApi.patch<ListItem>(`/lists/${listId}/items/${item.id}`, patch, { storeId }),
    onMutate: ({ item, patch }) => {
      queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, { ...item, ...patch }) : current));
    },
    onSuccess: (item) => queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, item) : current)),
    onError: (error) => {
      toast.error('Could not update the item', errorMessage(error));
      void refetch();
    },
  });
  const removeItem = useMutation({
    mutationFn: (item: ListItem) => customerApi.delete(`/lists/${listId}/items/${item.id}`),
    onMutate: (item) =>
      queryClient.setQueryData<ShoppingList>(key, (current) =>
        current ? { ...current, items: current.items.filter((i) => i.id !== item.id) } : current,
      ),
    onError: (error) => {
      toast.error('Could not remove the item', errorMessage(error));
      void refetch();
    },
  });
  const clearChecked = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>(`/lists/${listId}/clear-checked`),
    onSuccess: () => void refetch(),
  });

  const { open, done } = useMemo(() => {
    const sorted = [...(list?.items ?? [])].sort((a, b) => {
      if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt);
      const la = a.product?.location;
      const lb = b.product?.location;
      if (!la && !lb) return a.name.localeCompare(b.name);
      if (!la) return 1;
      if (!lb) return -1;
      return la.aisle - lb.aisle || la.row - lb.row || la.shelf - lb.shelf;
    });
    return { open: sorted.filter((i) => !i.isChecked), done: sorted.filter((i) => i.isChecked) };
  }, [list?.items, sort]);

  if (isLoading || !storeId) return <Loader />;
  if (!list)
    return <EmptyState emoji="🔒" title="This list is not available" body="It may have been deleted, or you are no longer a member." />;
  const isOwner = list.ownerId === session?.user.id;

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: list.name }} />
      <Row gap={space.md}>
        <Text style={{ fontSize: 34 }}>{list.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Row>
            <H1 numberOfLines={1} style={{ flexShrink: 1 }}>
              {list.name}
            </H1>
            <Badge label="● Live" tone="green" />
          </Row>
          <Muted>
            Prices and aisles for {store?.name} · updated {timeAgo(list.updatedAt)}
          </Muted>
        </View>
      </Row>

      <View style={{ marginTop: space.lg }}>
        <ProductFinder
          storeId={storeId}
          placeholder="Add an item, e.g. “milk” or “basmati rice”"
          onPick={(product: CatalogProduct) => addItem.mutate({ productId: product.id })}
          onFreeText={(name) => addItem.mutate({ name })}
        />
      </View>

      <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{open.length} to buy</Text>
        <View style={{ width: 180 }}>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'aisle', label: 'By aisle' },
              { value: 'recent', label: 'Recent' },
            ]}
          />
        </View>
      </Row>
      <Card style={{ padding: 0 }}>
        {open.length === 0 && <Muted style={{ textAlign: 'center', padding: space.xl }}>Everything is ticked off. Nice work! 🎉</Muted>}
        {open.map((item) => (
          <ListRow
            key={item.id}
            item={item}
            flash={flash.has(item.id)}
            onToggle={() => updateItem.mutate({ item, patch: { isChecked: true } })}
            onQuantity={(quantity) => (quantity <= 0 ? removeItem.mutate(item) : updateItem.mutate({ item, patch: { quantity } }))}
            onRemove={() => removeItem.mutate(item)}
          />
        ))}
      </Card>

      {done.length > 0 && (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }}>
            <Muted style={{ fontWeight: '700' }}>{done.length} in the basket</Muted>
            <Button title="Clear ticked" variant="ghost" size="sm" loading={clearChecked.isPending} onPress={() => clearChecked.mutate()} />
          </Row>
          <Card style={{ padding: 0, opacity: 0.8 }}>
            {done.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                flash={flash.has(item.id)}
                onToggle={() => updateItem.mutate({ item, patch: { isChecked: false } })}
                onRemove={() => removeItem.mutate(item)}
              />
            ))}
          </Card>
        </>
      )}

      <Card style={{ marginTop: space.lg, gap: space.sm }}>
        <Muted>Estimated total</Muted>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>{formatMoney(list.estimatedTotal)}</Text>
        <Muted style={{ fontSize: 12 }}>Based on today's prices at {store?.name}</Muted>
        <Button
          title="Shop this list in store"
          icon="storefront"
          style={{ marginTop: space.sm }}
          onPress={() => router.dismissTo({ pathname: '/instore', params: { list: list.id } })}
        />
        <AddAllToCart list={list} storeId={storeId} />
      </Card>

      <Card style={{ marginTop: space.lg, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Shared with</H2>
          <Button title="Invite" icon="person-add" variant="outline" size="sm" onPress={() => setSharing(true)} />
        </Row>
        {list.members.map((m) => {
          const self = m.userId === session?.user.id;
          return (
            <Row key={m.userId} gap={space.md}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(m.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>
                  {m.name} {self && <Text style={{ fontWeight: '400', color: colors.faint }}>(you)</Text>}
                </Text>
                <Muted style={{ fontSize: 12 }}>{m.role === 'OWNER' ? 'Owner' : 'Can edit'}</Muted>
              </View>
              {m.role !== 'OWNER' && (isOwner || self) && (
                <RemoveMember
                  listId={list.id}
                  userId={m.userId}
                  name={m.name}
                  self={self}
                  onDone={() => (self ? router.back() : void refetch())}
                />
              )}
            </Row>
          );
        })}
        <Pressable onPress={() => setSharing(true)} style={styles.code}>
          <Muted style={{ fontSize: 12 }}>Invite code</Muted>
          <Text style={styles.codeText}>{list.shareCode}</Text>
        </Pressable>
      </Card>
      {isOwner && <DeleteList list={list} />}
      <ShareSheet list={list} visible={sharing} onClose={() => setSharing(false)} onInvited={() => void refetch()} />
    </Screen>
  );
}

function ListRow({
  item,
  flash,
  onToggle,
  onQuantity,
  onRemove,
}: {
  item: ListItem;
  flash: boolean;
  onToggle: () => void;
  onQuantity?: (quantity: number) => void;
  onRemove: () => void;
}) {
  const product = item.product;
  return (
    <View style={[styles.row, flash && { backgroundColor: '#fef9c3' }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isChecked }}
        accessibilityLabel={item.isChecked ? 'Mark as not bought' : 'Mark as bought'}
        hitSlop={8}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={[styles.check, item.isChecked && { backgroundColor: colors.brand, borderColor: colors.brand }]}
      >
        {item.isChecked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </Pressable>
      {product ? (
        <ProductArt emoji={product.emoji} color={product.color} size={36} />
      ) : (
        <View style={styles.note}>
          <Text>📝</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[{ fontWeight: '500', color: colors.ink }, item.isChecked && { color: colors.faint, textDecorationLine: 'line-through' }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Muted style={{ fontSize: 12 }} numberOfLines={1}>
          {product ? `${product.unit} · ${formatMoney(product.price)} · ` : ''}
          {item.isChecked && item.checkedByName
            ? `picked by ${item.checkedByName.split(' ')[0]}`
            : `added by ${item.addedByName.split(' ')[0]}`}
        </Muted>
        {product?.stockStatus === 'OUT_OF_STOCK' && (
          <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '700' }}>Out of stock here</Text>
        )}
        {item.note && <Text style={{ fontSize: 12, color: colors.warning }}>“{item.note}”</Text>}
        {product?.location && <LocationTag location={product.location} />}
      </View>
      {onQuantity ? <Stepper value={item.quantity} onChange={onQuantity} /> : <Muted>×{item.quantity}</Muted>}
      <IconButton name="trash-outline" label="Remove" color={colors.faint} size={18} onPress={onRemove} />
    </View>
  );
}

function AddAllToCart({ list, storeId }: { list: ShoppingList; storeId: string }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const setMode = useShop((s) => s.setMode);
  const [busy, setBusy] = useState(false);
  const items = list.items.filter((i) => !i.isChecked && i.productId);
  return (
    <Button
      title="Order for delivery / pickup"
      icon="cart-outline"
      variant="outline"
      loading={busy}
      disabled={items.length === 0}
      onPress={async () => {
        setBusy(true);
        try {
          const products = await Promise.all(
            items.map((item) => publicApi.get<CatalogProduct>(`/catalog/products/${item.productId}`, { storeId }).catch(() => null)),
          );
          let added = 0;
          items.forEach((item, index) => {
            const product = products[index];
            if (!product || product.maxOrderQty === 0) return;
            for (let i = 0; i < Math.min(item.quantity, product.maxOrderQty); i++) add(product, storeId);
            added++;
          });
          setMode('DELIVERY');
          toast.success(`${added} items added to your cart`, 'Get them delivered in minutes or schedule a pickup.');
          router.push('/cart');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function RemoveMember({
  listId,
  userId,
  name,
  self,
  onDone,
}: {
  listId: string;
  userId: string;
  name: string;
  self: boolean;
  onDone: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => customerApi.delete(`/lists/${listId}/members/${userId}`),
    onSuccess: () => {
      toast.success(self ? 'You left the list' : 'Member removed');
      onDone();
    },
    onError: (error) => toast.error('Could not remove', errorMessage(error)),
  });
  return (
    <IconButton
      name={self ? 'exit-outline' : 'close'}
      label={self ? 'Leave list' : `Remove ${name}`}
      color={colors.faint}
      onPress={() =>
        Alert.alert(
          self ? 'Leave this list?' : `Remove ${name}?`,
          self ? 'You will stop seeing its updates.' : 'They will no longer see or edit this list.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: self ? 'Leave' : 'Remove', style: 'destructive', onPress: () => remove.mutate() },
          ],
        )
      }
    />
  );
}

function ShareSheet({
  list,
  visible,
  onClose,
  onInvited,
}: {
  list: ShoppingList;
  visible: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [contact, setContact] = useState('');
  const invite = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>(`/lists/${list.id}/invite`, { contact: contact.trim() }),
    onSuccess: () => {
      toast.success('Invite sent', 'They can now add and tick items.');
      setContact('');
      onInvited();
    },
    onError: (error) => toast.error('Could not invite', errorMessage(error)),
  });
  const shareText = `Join my SmartCart list “${list.name}” with code ${list.shareCode}`;
  return (
    <Sheet visible={visible} onClose={onClose} title="Share this list">
      <Muted>Everyone on the list sees changes instantly.</Muted>
      <View style={[styles.code, { marginTop: space.lg, paddingVertical: space.lg }]}>
        <Muted>Invite code</Muted>
        <Text style={[styles.codeText, { fontSize: 36 }]}>{list.shareCode}</Text>
        <Button
          title="Share invite"
          icon="share-outline"
          variant="outline"
          size="sm"
          style={{ marginTop: space.sm }}
          onPress={() => void Share.share({ message: shareText, title: list.name })}
        />
      </View>
      <View style={{ marginTop: space.xl }}>
        <Field
          label="Or add someone who already uses SmartCart"
          hint="Their email address or phone number"
          value={contact}
          onChangeText={setContact}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="rahul@example.com or 98765 43210"
        />
        <Button title="Add to list" disabled={!contact.trim()} loading={invite.isPending} onPress={() => invite.mutate()} />
      </View>
    </Sheet>
  );
}

function DeleteList({ list }: { list: ShoppingList }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => customerApi.delete(`/lists/${list.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success('List deleted');
      router.back();
    },
    onError: (error) => toast.error('Could not delete the list', errorMessage(error)),
  });
  return (
    <Button
      title="Delete list"
      icon="trash-outline"
      variant="ghost"
      style={{ marginTop: space.lg }}
      loading={remove.isPending}
      onPress={() =>
        Alert.alert(`Delete “${list.name}”?`, `It disappears for everyone it is shared with. ${list.items.length} items will be removed.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
        ])
      }
    />
  );
}

function upsertItem(list: ShoppingList, item: ListItem): ShoppingList {
  const exists = list.items.some((i) => i.id === item.id);
  return {
    ...list,
    items: exists
      ? list.items.map((i) => (i.id === item.id ? { ...i, ...item, product: item.product ?? i.product } : i))
      : [...list.items, item],
  };
}

function applyEvent(list: ShoppingList, event: ListUpdateEvent): ShoppingList {
  switch (event.action) {
    case 'ITEM_ADDED':
    case 'ITEM_UPDATED':
      return event.item ? upsertItem(list, event.item) : list;
    case 'ITEM_REMOVED':
      return { ...list, items: list.items.filter((i) => i.id !== event.itemId) };
    case 'MEMBER_JOINED':
      return event.member && !list.members.some((m) => m.userId === event.member!.userId)
        ? { ...list, members: [...list.members, event.member] }
        : list;
    case 'MEMBER_LEFT':
      return event.member ? { ...list, members: list.members.filter((m) => m.userId !== event.member!.userId) } : list;
    case 'LIST_UPDATED':
      return event.list ? { ...list, name: event.list.name, emoji: event.list.emoji } : list;
    default:
      return list;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: colors.brandDark },
  code: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  codeText: { fontSize: 22, fontWeight: '800', letterSpacing: 6, color: colors.ink },
});
