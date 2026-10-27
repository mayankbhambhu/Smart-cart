import {
  SocketEvents,
  describeLocation,
  formatMoney,
  timeAgo,
  type CatalogProduct,
  type ListItem,
  type ListUpdateEvent,
  type ShoppingList,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, MapPin, MoreHorizontal, ShoppingCart, Store, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LocationTag, ProductArt } from '@/components/product';
import { Avatar, Badge, Button, Card, ErrorState, Field, IconButton, Input, Modal, PageLoader, Segmented, Stepper } from '@/components/ui';
import { customerApi, errorMessage, publicApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { useCart, useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn, copyToClipboard } from '@/lib/utils';
import { useCurrentStore } from './hooks';
import { ProductSearchBox } from '@/components/ProductSearchBox';

type SortMode = 'aisle' | 'recent';

export default function ListDetailPage() {
  const { listId } = useParams();
  const session = useSession('CUSTOMER');
  const { store } = useCurrentStore();
  const storeId = store?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const key = ['list', listId, storeId];
  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: () => customerApi.get<ShoppingList>(`/lists/${listId}`, { query: { storeId } }),
    enabled: Boolean(storeId),
  });
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortMode>('aisle');
  const [sharing, setSharing] = useState(false);

  useRoom('CUSTOMER', SocketEvents.JOIN_LIST, SocketEvents.LEAVE_LIST, listId);
  useSocketEvent<ListUpdateEvent>('CUSTOMER', SocketEvents.LIST_UPDATED, (event) => {
    if (event.listId !== listId) return;
    if (event.action === 'LIST_DELETED') {
      toast.info('This list was deleted');
      navigate('/lists');
      return;
    }
    // Apply the change instantly, then refetch so prices and aisle locations match this store.
    queryClient.setQueryData<ShoppingList>(key, (current) => (current ? applyEvent(current, event) : current));
    if (event.item && event.actor.id !== session?.user.id) {
      const id = event.item.id;
      setFlash((s) => new Set(s).add(id));
      setTimeout(
        () =>
          setFlash((s) => {
            const next = new Set(s);
            next.delete(id);
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
      customerApi.post<ListItem>(`/lists/${listId}/items`, { ...input, quantity: 1 }, { query: { storeId } }),
    onSuccess: (item) => {
      queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, item) : current));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error('Could not add the item', errorMessage(err)),
  });

  const updateItem = useMutation({
    mutationFn: ({ item, patch }: { item: ListItem; patch: { quantity?: number; isChecked?: boolean } }) =>
      customerApi.patch<ListItem>(`/lists/${listId}/items/${item.id}`, patch, { query: { storeId } }),
    onMutate: ({ item, patch }) => {
      queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, { ...item, ...patch }) : current));
    },
    onSuccess: (item) => queryClient.setQueryData<ShoppingList>(key, (current) => (current ? upsertItem(current, item) : current)),
    onError: (err) => {
      toast.error('Could not update the item', errorMessage(err));
      void refetch();
    },
  });

  const removeItem = useMutation({
    mutationFn: (item: ListItem) => customerApi.delete(`/lists/${listId}/items/${item.id}`),
    onMutate: (item) =>
      queryClient.setQueryData<ShoppingList>(key, (current) =>
        current ? { ...current, items: current.items.filter((i) => i.id !== item.id) } : current,
      ),
    onError: (err) => {
      toast.error('Could not remove the item', errorMessage(err));
      void refetch();
    },
  });

  const clearChecked = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>(`/lists/${listId}/clear-checked`),
    onSuccess: () => void refetch(),
  });

  const { open, done } = useMemo(() => {
    const items = list?.items ?? [];
    const sorted = [...items].sort((a, b) => {
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

  if (isLoading || !storeId) return <PageLoader />;
  if (error || !list) return <ErrorState error={error} retry={() => void refetch()} />;
  const isOwner = list.ownerId === session?.user.id;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div>
          <Link to="/lists" className="text-sm font-semibold text-brand-700">
            ← All lists
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-3xl">{list.emoji}</span>
            <h1 className="text-2xl font-extrabold text-slate-900">{list.name}</h1>
            <Badge tone="green">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-600" /> Live
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Prices and aisle locations for <strong>{store?.name}</strong> · updated {timeAgo(list.updatedAt)}
          </p>
        </div>

        <ProductSearchBox
          storeId={storeId}
          placeholder='Add an item, e.g. "milk" or "basmati rice"'
          onPick={(product: CatalogProduct) => addItem.mutate({ productId: product.id })}
          onFreeText={(name) => addItem.mutate({ name })}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">{open.length} to buy</p>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'aisle', label: 'By aisle' },
              { value: 'recent', label: 'Recent' },
            ]}
          />
        </div>

        <Card className="divide-y divide-slate-100">
          {open.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Everything is ticked off. Nice work! 🎉</p>}
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
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">{done.length} in the basket</p>
              <Button variant="ghost" size="sm" loading={clearChecked.isPending} onClick={() => clearChecked.mutate()}>
                Clear ticked items
              </Button>
            </div>
            <Card className="divide-y divide-slate-100 opacity-80">
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
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Estimated total</p>
          <p className="tabular text-3xl font-extrabold text-slate-900">{formatMoney(list.estimatedTotal)}</p>
          <p className="text-xs text-slate-400">Based on today's prices at {store?.name}</p>
          <div className="mt-4 space-y-2">
            <Link to={`/instore?list=${list.id}`}>
              <Button block icon={<Store className="size-4" />}>
                Shop this list in store
              </Button>
            </Link>
            <AddAllToCart list={list} storeId={storeId} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-900">Shared with</p>
            <Button size="sm" variant="outline" icon={<UserPlus className="size-4" />} onClick={() => setSharing(true)}>
              Invite
            </Button>
          </div>
          <ul className="mt-3 space-y-3">
            {list.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {m.name} {m.userId === session?.user.id && <span className="font-normal text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">{m.role === 'OWNER' ? 'Owner' : 'Can edit'}</p>
                </div>
                {m.role !== 'OWNER' && (isOwner || m.userId === session?.user.id) && (
                  <RemoveMember
                    listId={list.id}
                    userId={m.userId}
                    self={m.userId === session?.user.id}
                    onDone={() => (m.userId === session?.user.id ? navigate('/lists') : void refetch())}
                  />
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSharing(true)}
            className="mt-4 w-full rounded-xl border border-dashed border-slate-300 p-3 text-center"
          >
            <span className="block text-xs text-slate-500">Invite code</span>
            <span className="font-mono text-xl font-extrabold tracking-[0.25em] text-slate-900">{list.shareCode}</span>
          </button>
        </Card>
        {isOwner && <ListSettings list={list} />}
      </aside>

      <ShareModal list={list} open={sharing} onClose={() => setSharing(false)} onInvited={() => void refetch()} />
    </div>
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
    <div className={cn('flex items-center gap-3 px-4 py-3', flash && 'animate-flash')}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.isChecked ? 'Mark as not bought' : 'Mark as bought'}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          item.isChecked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:border-brand-500',
        )}
      >
        {item.isChecked && <Check className="size-4" strokeWidth={3} />}
      </button>
      {product ? (
        <ProductArt emoji={product.emoji} color={product.color} imageUrl={product.imageUrl} size="xs" />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100">📝</span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', item.isChecked ? 'text-slate-400 line-through' : 'text-slate-900')}>{item.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          {product && (
            <span>
              {product.unit} · {formatMoney(product.price)}
            </span>
          )}
          {product?.stockStatus === 'OUT_OF_STOCK' && <span className="font-semibold text-rose-600">Out of stock here</span>}
          <span>
            {item.isChecked && item.checkedByName
              ? `Picked by ${item.checkedByName.split(' ')[0]}`
              : `Added by ${item.addedByName.split(' ')[0]}`}
          </span>
        </p>
        {item.note && <p className="text-xs text-amber-700">“{item.note}”</p>}
      </div>
      {product?.location && (
        <span title={describeLocation(product.location, { withLabel: true })} className="hidden sm:block">
          <LocationTag location={product.location} />
        </span>
      )}
      {onQuantity ? (
        <Stepper size="sm" value={item.quantity} onChange={onQuantity} />
      ) : (
        <span className="text-sm text-slate-500">×{item.quantity}</span>
      )}
      <IconButton label="Remove" onClick={onRemove} className="size-8 text-slate-400 hover:text-rose-600">
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}

function AddAllToCart({ list, storeId }: { list: ShoppingList; storeId: string }) {
  const add = useCart((s) => s.add);
  const setMode = useShop((s) => s.setMode);
  const [busy, setBusy] = useState(false);
  const items = list.items.filter((i) => !i.isChecked && i.productId);
  return (
    <Button
      block
      variant="outline"
      icon={<ShoppingCart className="size-4" />}
      loading={busy}
      disabled={items.length === 0}
      onClick={async () => {
        setBusy(true);
        try {
          const products = await Promise.all(
            items.map((item) =>
              publicApi.get<CatalogProduct>(`/catalog/products/${item.productId}`, { query: { storeId } }).catch(() => null),
            ),
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
        } finally {
          setBusy(false);
        }
      }}
    >
      Order for delivery / pickup
    </Button>
  );
}

function RemoveMember({ listId, userId, self, onDone }: { listId: string; userId: string; self: boolean; onDone: () => void }) {
  const remove = useMutation({
    mutationFn: () => customerApi.delete(`/lists/${listId}/members/${userId}`),
    onSuccess: () => {
      toast.success(self ? 'You left the list' : 'Member removed');
      onDone();
    },
    onError: (err) => toast.error('Could not remove', errorMessage(err)),
  });
  return (
    <IconButton
      label={self ? 'Leave list' : 'Remove member'}
      onClick={() => remove.mutate()}
      className="size-8 text-slate-400 hover:text-rose-600"
    >
      <X className="size-4" />
    </IconButton>
  );
}

function ShareModal({ list, open, onClose, onInvited }: { list: ShoppingList; open: boolean; onClose: () => void; onInvited: () => void }) {
  const [contact, setContact] = useState('');
  const invite = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>(`/lists/${list.id}/invite`, { contact }),
    onSuccess: () => {
      toast.success('Invite sent', 'They can now add and tick items.');
      setContact('');
      onInvited();
    },
    onError: (err) => toast.error('Could not invite', errorMessage(err)),
  });
  const shareText = `Join my SmartCart list "${list.name}" with code ${list.shareCode}`;
  return (
    <Modal open={open} onClose={onClose} title="Share this list" description="Everyone on the list sees changes instantly.">
      <div className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-500">Invite code</p>
          <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-slate-900">{list.shareCode}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<Copy className="size-4" />}
              onClick={() => copyToClipboard(shareText).then(() => toast.success('Copied to clipboard'))}
            >
              Copy invite
            </Button>
            {'share' in navigator && (
              <Button
                size="sm"
                variant="outline"
                icon={<MoreHorizontal className="size-4" />}
                onClick={() => void navigator.share({ title: list.name, text: shareText }).catch(() => undefined)}
              >
                Share…
              </Button>
            )}
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (contact.trim()) invite.mutate();
          }}
        >
          <Field label="Or add someone who already uses SmartCart" hint="Their email address or phone number">
            <div className="flex gap-2">
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="rahul@example.com or 98765 43210" />
              <Button type="submit" loading={invite.isPending}>
                Add
              </Button>
            </div>
          </Field>
        </form>
      </div>
    </Modal>
  );
}

function ListSettings({ list }: { list: ShoppingList }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => customerApi.delete(`/lists/${list.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success('List deleted');
      navigate('/lists');
    },
  });
  return (
    <>
      <Button variant="ghost" block className="text-rose-600" icon={<Trash2 className="size-4" />} onClick={() => setConfirming(true)}>
        Delete list
      </Button>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete "${list.name}"?`}
        description="It disappears for everyone it is shared with."
        footer={
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="size-4" /> {list.items.length} items will be removed.
        </p>
      </Modal>
    </>
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
