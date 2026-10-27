import {
  INVENTORY_MOVEMENT_LABELS,
  STOCK_STATUS_LABELS,
  SocketEvents,
  describeLocation,
  formatMoney,
  shortLocation,
  timeAgo,
  type Category,
  type InventoryMovement,
  type InventoryRow,
  type InventoryUpdateEvent,
  type StockStatus,
} from '@smartcart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpFromLine, History, PackagePlus, Pencil, Scale, Search } from 'lucide-react';
import { useState } from 'react';
import { ProductArt } from '@/components/product';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Segmented,
  Select,
  Table,
  Td,
  Th,
  Toggle,
} from '@/components/ui';
import { ApiError, errorMessage, publicApi } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { cn, paiseToRupees, rupeesToPaise, useDebounced } from '@/lib/utils';
import { PageHeader, StockBar } from './components';
import { useOps } from './hooks';

type StatusFilter = 'ALL' | 'LOW' | 'OUT' | 'OK';
type Sort = 'location' | 'name' | 'shelf_asc' | 'updated';
interface InventoryPageData {
  items: InventoryRow[];
  total: number;
  counts: { low: number; out: number; ok: number };
}

const statusTone: Record<StockStatus, 'green' | 'orange' | 'red'> = { IN_STOCK: 'green', LOW_STOCK: 'orange', OUT_OF_STOCK: 'red' };

export default function InventoryPage() {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [aisle, setAisle] = useState('');
  const [sort, setSort] = useState<Sort>('location');
  const [limit, setLimit] = useState(100);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ kind: 'restock' | 'receive' | 'count' | 'edit' | 'history'; row: InventoryRow } | null>(null);
  const query = useDebounced(q, 250);
  const key = ['inventory', ops.storeId, query, status, categoryId, aisle, sort, limit];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: key,
    queryFn: () =>
      ops.get<InventoryPageData>('/inventory', {
        query: { q: query || undefined, status, categoryId: categoryId || undefined, aisle: aisle || undefined, sort, limit },
      }),
    placeholderData: keepPreviousData,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', ops.storeId],
    queryFn: () => publicApi.get<Category[]>('/catalog/categories', { query: { storeId: ops.storeId } }),
    staleTime: 10 * 60_000,
  });

  // Smart-cart scans, online orders and restocks update rows in place.
  useSocketEvent<InventoryUpdateEvent>('STAFF', SocketEvents.INVENTORY_UPDATED, (event) => {
    if (event.storeId !== ops.storeId) return;
    queryClient.setQueriesData<InventoryPageData>({ queryKey: ['inventory', ops.storeId] }, (current) =>
      current
        ? {
            ...current,
            items: current.items.map((row) =>
              row.storeProductId === event.storeProductId
                ? { ...row, shelfQty: event.shelfQty, storageQty: event.storageQty, stockStatus: event.stockStatus, updatedAt: event.at }
                : row,
            ),
          }
        : current,
    );
    setFlash((s) => new Set(s).add(event.storeProductId));
    setTimeout(
      () =>
        setFlash((s) => {
          const next = new Set(s);
          next.delete(event.storeProductId);
          return next;
        }),
      1400,
    );
  });

  const counts = data?.counts ?? { low: 0, out: 0, ok: 0 };
  const canReceive = ops.isSupervisor || ops.membership.department === 'WAREHOUSE';
  const done = () => {
    setAction(null);
    void queryClient.invalidateQueries({ queryKey: ['inventory', ops.storeId] });
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Live shelf and storeroom stock. Items dropped into smart carts are deducted the moment they are scanned."
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
          <Input className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand, SKU or barcode" />
        </div>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All' },
            {
              value: 'LOW',
              label: (
                <span>
                  Low <span className="text-amber-600">{counts.low}</span>
                </span>
              ),
            },
            {
              value: 'OUT',
              label: (
                <span>
                  Out <span className="text-rose-600">{counts.out}</span>
                </span>
              ),
            },
            { value: 'OK', label: 'Healthy' },
          ]}
        />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </Select>
        <Input
          value={aisle}
          onChange={(e) => setAisle(e.target.value.replace(/\D/g, ''))}
          placeholder="Aisle"
          className="w-20"
          aria-label="Aisle"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-44" aria-label="Sort">
          <option value="location">Sort: aisle order</option>
          <option value="shelf_asc">Sort: lowest shelf stock</option>
          <option value="name">Sort: name</option>
          <option value="updated">Sort: recently changed</option>
        </Select>
      </Card>

      <Card className={cn(isFetching && 'opacity-80')}>
        {isLoading ? (
          <PageLoader />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="📦" title="No products match these filters" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Location</Th>
                <Th>Stock</Th>
                <Th>Reorder at</Th>
                <Th className="text-right">Price</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr
                  key={row.storeProductId}
                  className={cn(flash.has(row.storeProductId) && 'animate-flash', !row.isAvailable && 'opacity-50')}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProductArt emoji={row.emoji} color={row.color} imageUrl={row.imageUrl} size="xs" />
                      <div className="min-w-0">
                        <p className="max-w-64 truncate font-medium text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">
                          {row.unit} · {row.sku}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span
                      className="font-mono text-xs font-semibold text-slate-700"
                      title={describeLocation(row.location, { withLabel: true })}
                    >
                      {shortLocation(row.location)} · S{row.location.shelf}
                    </span>
                  </Td>
                  <Td>
                    <StockBar shelf={row.shelfQty} storage={row.storageQty} threshold={row.reorderThreshold} target={row.restockTarget} />
                  </Td>
                  <Td className="text-xs text-slate-500">
                    ≤ {row.reorderThreshold} · fill to {row.restockTarget}
                  </Td>
                  <Td className="tabular text-right">
                    <span className="font-semibold text-slate-900">{formatMoney(row.price)}</span>
                    {row.mrp > row.price && <span className="block text-xs text-slate-400 line-through">{formatMoney(row.mrp)}</span>}
                  </Td>
                  <Td>
                    <Badge tone={statusTone[row.stockStatus]}>{STOCK_STATUS_LABELS[row.stockStatus]}</Badge>
                    {!row.isAvailable && (
                      <Badge tone="gray" className="ml-1">
                        Hidden
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      size="xs"
                      variant={row.stockStatus === 'IN_STOCK' ? 'outline' : 'primary'}
                      icon={<ArrowUpFromLine className="size-3.5" />}
                      disabled={row.storageQty === 0}
                      onClick={() => setAction({ kind: 'restock', row })}
                    >
                      Restock
                    </Button>
                    {canReceive && (
                      <IconButton label="Receive delivery" onClick={() => setAction({ kind: 'receive', row })}>
                        <PackagePlus className="size-4" />
                      </IconButton>
                    )}
                    {ops.isSupervisor && (
                      <>
                        <IconButton label="Count / write off" onClick={() => setAction({ kind: 'count', row })}>
                          <Scale className="size-4" />
                        </IconButton>
                        <IconButton label="Edit product settings" onClick={() => setAction({ kind: 'edit', row })}>
                          <Pencil className="size-4" />
                        </IconButton>
                      </>
                    )}
                    <IconButton label="Stock history" onClick={() => setAction({ kind: 'history', row })}>
                      <History className="size-4" />
                    </IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > data.items.length && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(limit + 100)}>
              Show more ({data.total - data.items.length} remaining)
            </Button>
          </div>
        )}
      </Card>

      {action?.kind === 'restock' && <QuantityModal row={action.row} mode="restock" onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'receive' && <QuantityModal row={action.row} mode="receive" onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'count' && <CountModal row={action.row} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'edit' && <EditModal row={action.row} onClose={() => setAction(null)} onDone={done} />}
      <HistoryDrawer row={action?.kind === 'history' ? action.row : null} onClose={() => setAction(null)} />
    </div>
  );
}

function QuantityModal({
  row,
  mode,
  onClose,
  onDone,
}: {
  row: InventoryRow;
  mode: 'restock' | 'receive';
  onClose: () => void;
  onDone: () => void;
}) {
  const ops = useOps();
  const suggested =
    mode === 'restock' ? Math.max(1, Math.min(row.storageQty, row.restockTarget - row.shelfQty)) : Math.max(row.restockTarget * 2, 12);
  const [quantity, setQuantity] = useState(String(suggested));
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => ops.post(`/inventory/${row.storeProductId}/${mode}`, { quantity: Number(quantity), note: note || undefined }),
    onSuccess: () => {
      toast.success(mode === 'restock' ? `Moved ${quantity} to the shelf` : `Received ${quantity} into storage`, row.name);
      onDone();
    },
    onError: (error) => toast.error('Could not update stock', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'restock' ? 'Restock the shelf' : 'Receive a delivery'}
      description={`${row.name} · ${describeLocation(row.location)}`}
      footer={
        <Button loading={save.isPending} disabled={!Number(quantity)} onClick={() => save.mutate()}>
          {mode === 'restock' ? 'Move to shelf' : 'Add to storage'}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Shelf <strong>{row.shelfQty}</strong> · storage <strong>{row.storageQty}</strong> · target {row.restockTarget}
        </p>
        <Field label={mode === 'restock' ? 'Units moved from storage to the shelf' : 'Units received from the supplier'}>
          <Input
            type="number"
            min={1}
            max={mode === 'restock' ? row.storageQty : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'receive' ? 'Invoice number, supplier…' : ''}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CountModal({ row, onClose, onDone }: { row: InventoryRow; onClose: () => void; onDone: () => void }) {
  const ops = useOps();
  const [shelf, setShelf] = useState(String(row.shelfQty));
  const [storage, setStorage] = useState(String(row.storageQty));
  const [reason, setReason] = useState<'ADJUSTMENT' | 'DAMAGE'>('ADJUSTMENT');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () =>
      ops.post(`/inventory/${row.storeProductId}/count`, {
        shelfQty: Number(shelf),
        storageQty: Number(storage),
        reason,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Stock count saved', row.name);
      onDone();
    },
    onError: (error) => toast.error('Could not save the count', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Stock count / write-off"
      description={row.name}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save count
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={reason}
          onChange={setReason}
          options={[
            { value: 'ADJUSTMENT', label: 'Cycle count' },
            { value: 'DAMAGE', label: 'Damaged / expired' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Counted on shelf">
            <Input type="number" min={0} value={shelf} onChange={(e) => setShelf(e.target.value)} />
          </Field>
          <Field label="Counted in storage">
            <Input type="number" min={0} value={storage} onChange={(e) => setStorage(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === 'DAMAGE' ? '3 packs crushed in transit' : 'Weekly count'}
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditModal({ row, onClose, onDone }: { row: InventoryRow; onClose: () => void; onDone: () => void }) {
  const ops = useOps();
  const [form, setForm] = useState({
    price: paiseToRupees(row.price),
    reorderThreshold: String(row.reorderThreshold),
    restockTarget: String(row.restockTarget),
    aisle: String(row.location.aisle),
    row: String(row.location.row),
    shelf: String(row.location.shelf),
    isAvailable: row.isAvailable,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const save = useMutation({
    mutationFn: () =>
      ops.patch(`/inventory/${row.storeProductId}`, {
        ...(ops.isLeadership && rupeesToPaise(form.price) !== row.price ? { price: rupeesToPaise(form.price) } : {}),
        reorderThreshold: Number(form.reorderThreshold),
        restockTarget: Number(form.restockTarget),
        aisle: Number(form.aisle),
        row: Number(form.row),
        shelf: Number(form.shelf),
        isAvailable: form.isAvailable,
      }),
    onSuccess: () => {
      toast.success('Product updated', row.name);
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save', errorMessage(error));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Product settings"
      description={`${row.name} · cost ${formatMoney(row.cost)} · MRP ${formatMoney(row.mrp)}`}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Selling price (₹)" error={errors.price} hint={ops.isLeadership ? undefined : 'Managers only'}>
            <Input value={form.price} onChange={set('price')} disabled={!ops.isLeadership} inputMode="decimal" />
          </Field>
          <Field label="Alert at (shelf ≤)" error={errors.reorderThreshold}>
            <Input type="number" value={form.reorderThreshold} onChange={set('reorderThreshold')} />
          </Field>
          <Field label="Fill shelf to" error={errors.restockTarget}>
            <Input type="number" value={form.restockTarget} onChange={set('restockTarget')} />
          </Field>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Shelf location</p>
          <div className="mt-1.5 grid grid-cols-3 gap-3">
            <Field label="Aisle" error={errors.aisle}>
              <Input type="number" min={1} value={form.aisle} onChange={set('aisle')} />
            </Field>
            <Field label="Row" error={errors.row}>
              <Input type="number" min={1} value={form.row} onChange={set('row')} />
            </Field>
            <Field label="Shelf" error={errors.shelf}>
              <Input type="number" min={1} value={form.shelf} onChange={set('shelf')} />
            </Field>
          </div>
        </div>
        <Toggle
          checked={form.isAvailable}
          onChange={(isAvailable) => setForm({ ...form, isAvailable })}
          label="Sold at this store (visible to shoppers)"
        />
      </div>
    </Modal>
  );
}

function HistoryDrawer({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const ops = useOps();
  const { data = [], isLoading } = useQuery({
    queryKey: ['inventory-movements', row?.storeProductId],
    queryFn: () => ops.get<InventoryMovement[]>(`/inventory/${row!.storeProductId}/movements`),
    enabled: Boolean(row),
  });
  return (
    <Drawer open={Boolean(row)} onClose={onClose} title="Stock history">
      {row && (
        <div className="p-5">
          <div className="flex items-center gap-3">
            <ProductArt emoji={row.emoji} color={row.color} imageUrl={row.imageUrl} size="sm" />
            <div>
              <p className="font-semibold text-slate-900">{row.name}</p>
              <p className="text-xs text-slate-500">{describeLocation(row.location, { withLabel: true })}</p>
            </div>
          </div>
          {isLoading ? (
            <PageLoader />
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {data.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{INVENTORY_MOVEMENT_LABELS[m.type]}</p>
                    <p className="text-xs text-slate-500">
                      {m.actorName ?? 'System'} · {timeAgo(m.createdAt)}
                      {m.note ? ` · ${m.note}` : ''}
                    </p>
                  </div>
                  <div className="tabular text-right text-xs">
                    {m.shelfDelta !== 0 && (
                      <p className={m.shelfDelta > 0 ? 'text-brand-700' : 'text-rose-600'}>
                        shelf {m.shelfDelta > 0 ? '+' : ''}
                        {m.shelfDelta}
                      </p>
                    )}
                    {m.storageDelta !== 0 && (
                      <p className={m.storageDelta > 0 ? 'text-brand-700' : 'text-slate-500'}>
                        storage {m.storageDelta > 0 ? '+' : ''}
                        {m.storageDelta}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {data.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No movements yet.</li>}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  );
}
