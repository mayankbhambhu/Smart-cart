import {
  OFFER_TYPES,
  OFFER_TYPE_LABELS,
  ORDER_CHANNELS,
  ORDER_CHANNEL_LABELS,
  formatMoney,
  type CatalogProduct,
  type Category,
  type Offer,
  type OfferType,
  type OrderChannel,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { ProductSearchBox } from '@/components/ProductSearchBox';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Select,
  Textarea,
  Toggle,
} from '@/components/ui';
import { ApiError, errorMessage, publicApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn, formatDate, paiseToRupees, rupeesToPaise } from '@/lib/utils';
import { PageHeader } from './components';
import { useOps } from './hooks';

function describeOffer(o: Offer): string {
  switch (o.type) {
    case 'PERCENT_OFF':
      return `${o.value}% off${o.maxDiscount ? ` (up to ${formatMoney(o.maxDiscount)})` : ''}`;
    case 'FLAT_OFF':
      return `${formatMoney(o.value)} off`;
    case 'BOGO':
      return `Buy ${o.buyQty}, get ${o.getQty} free`;
    default:
      return 'Free delivery';
  }
}

export default function OffersPage() {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [includeExpired, setIncludeExpired] = useState(false);
  const [editing, setEditing] = useState<Offer | 'new' | null>(null);
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['ops-offers', ops.storeId, includeExpired],
    queryFn: () => ops.get<Offer[]>('/offers', { query: { includeExpired } }),
  });
  const deactivate = useMutation({
    mutationFn: (offer: Offer) => ops.del(`/offers/${offer.id}`),
    onSuccess: () => {
      toast.success('Offer ended');
      void queryClient.invalidateQueries({ queryKey: ['ops-offers', ops.storeId] });
    },
    onError: (error) => toast.error('Could not end the offer', errorMessage(error)),
  });
  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Offers & coupons"
        subtitle="Store offers you run plus SmartCart-wide campaigns. See which ones customers love in Analytics."
        actions={
          <>
            <Toggle checked={includeExpired} onChange={setIncludeExpired} label="Show ended" />
            {ops.isLeadership && (
              <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                New offer
              </Button>
            )}
          </>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : offers.length === 0 ? (
        <EmptyState icon="🏷️" title="No offers yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => {
            const live = offer.isActive && new Date(offer.startsAt).getTime() <= now && new Date(offer.endsAt).getTime() > now;
            const own = offer.storeId === ops.storeId;
            return (
              <Card key={offer.id} className={cn('overflow-hidden', !live && 'opacity-70')}>
                <div className="flex items-start justify-between gap-2 p-4 text-white" style={{ backgroundColor: offer.bannerColor }}>
                  <div className="min-w-0">
                    <p className="font-bold">{offer.title}</p>
                    <p className="text-sm opacity-90">{describeOffer(offer)}</p>
                  </div>
                  {offer.code && (
                    <span className="shrink-0 rounded-lg border border-dashed border-white/70 px-2 py-1 font-mono text-xs font-bold">
                      {offer.code}
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4 text-sm">
                  {offer.description && <p className="text-slate-600">{offer.description}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={live ? 'green' : 'gray'}>
                      {live ? 'Live' : offer.isActive && new Date(offer.startsAt).getTime() > now ? 'Scheduled' : 'Ended'}
                    </Badge>
                    <Badge tone={own ? 'blue' : 'violet'}>{own ? 'This store' : 'SmartCart-wide'}</Badge>
                    {(offer.channels.length === 0 ? ['All channels'] : offer.channels.map((c) => ORDER_CHANNEL_LABELS[c])).map((c) => (
                      <Badge key={c} tone="gray">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDate(offer.startsAt)} – {formatDate(offer.endsAt)}
                    {offer.minOrderValue > 0 && ` · min order ${formatMoney(offer.minOrderValue)}`}
                    {offer.usageLimitPerUser && ` · ${offer.usageLimitPerUser}× per customer`}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-sm">
                      <strong className="text-slate-900">{offer.redemptions}</strong> <span className="text-slate-500">redemptions</span>
                    </p>
                    {own && ops.isLeadership && (
                      <div className="flex gap-1">
                        <IconButton label="Edit offer" onClick={() => setEditing(offer)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        {live && (
                          <IconButton label="End offer now" onClick={() => deactivate.mutate(offer)} className="hover:text-rose-600">
                            <Power className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <OfferModal offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

function OfferModal({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', ops.storeId],
    queryFn: () => publicApi.get<Category[]>('/catalog/categories', { query: { storeId: ops.storeId } }),
    staleTime: 10 * 60_000,
  });
  const [product, setProduct] = useState<Pick<CatalogProduct, 'id' | 'name'> | null>(
    offer?.productId ? { id: offer.productId, name: 'Selected product' } : null,
  );
  const [form, setForm] = useState({
    title: offer?.title ?? '',
    code: offer?.code ?? '',
    description: offer?.description ?? '',
    type: offer?.type ?? ('PERCENT_OFF' as OfferType),
    value: offer ? (offer.type === 'FLAT_OFF' ? paiseToRupees(offer.value) : String(offer.value)) : '10',
    minOrderValue: offer ? paiseToRupees(offer.minOrderValue) : '0',
    maxDiscount: offer?.maxDiscount ? paiseToRupees(offer.maxDiscount) : '',
    categoryId: offer?.categoryId ?? '',
    buyQty: String(offer?.buyQty ?? 2),
    getQty: String(offer?.getQty ?? 1),
    channels: offer?.channels ?? ([] as OrderChannel[]),
    startsAt: toLocalInput(offer?.startsAt ?? new Date().toISOString()),
    endsAt: toLocalInput(offer?.endsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString()),
    usageLimitPerUser: offer?.usageLimitPerUser ? String(offer.usageLimitPerUser) : '',
    bannerColor: offer?.bannerColor ?? '#0a8f45',
    isActive: offer?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        code: form.code.trim() ? form.code.trim().toUpperCase() : null,
        description: form.description || null,
        type: form.type,
        value: form.type === 'FLAT_OFF' ? rupeesToPaise(form.value) : form.type === 'PERCENT_OFF' ? Number(form.value) : 0,
        minOrderValue: rupeesToPaise(form.minOrderValue || '0'),
        maxDiscount: form.type === 'PERCENT_OFF' && form.maxDiscount ? rupeesToPaise(form.maxDiscount) : null,
        categoryId: form.type === 'PERCENT_OFF' && form.categoryId ? form.categoryId : null,
        productId: form.type === 'BOGO' ? (product?.id ?? null) : null,
        buyQty: form.type === 'BOGO' ? Number(form.buyQty) : null,
        getQty: form.type === 'BOGO' ? Number(form.getQty) : null,
        channels: form.channels,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        usageLimitPerUser: form.usageLimitPerUser ? Number(form.usageLimitPerUser) : null,
        bannerColor: form.bannerColor,
        isActive: form.isActive,
      };
      return offer ? ops.patch<Offer>(`/offers/${offer.id}`, body) : ops.post<Offer>('/offers', body);
    },
    onSuccess: () => {
      toast.success(offer ? 'Offer updated' : 'Offer created', 'Customers see it on the home screen right away.');
      void queryClient.invalidateQueries({ queryKey: ['ops-offers', ops.storeId] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save the offer', errorMessage(error));
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={offer ? 'Edit offer' : 'New offer'}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          {offer ? 'Save' : 'Create offer'}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={errors.title} className="sm:col-span-2">
          <Input value={form.title} onChange={set('title')} placeholder="Monsoon special: 15% off" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={set('type')}>
            {OFFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {OFFER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Coupon code" error={errors.code} hint="Leave empty to apply automatically">
          <Input value={form.code} onChange={set('code')} className="font-mono uppercase" placeholder="MONSOON15" />
        </Field>
        {form.type === 'PERCENT_OFF' && (
          <>
            <Field label="Percent off" error={errors.value}>
              <Input type="number" min={1} max={90} value={form.value} onChange={set('value')} />
            </Field>
            <Field label="Max discount (₹)">
              <Input value={form.maxDiscount} onChange={set('maxDiscount')} inputMode="decimal" placeholder="150" />
            </Field>
            <Field label="Only on category (optional)" className="sm:col-span-2">
              <Select value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Whole basket</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {form.type === 'FLAT_OFF' && (
          <Field label="Amount off (₹)" error={errors.value}>
            <Input value={form.value} onChange={set('value')} inputMode="decimal" />
          </Field>
        )}
        {form.type === 'BOGO' && (
          <>
            <Field label="Product" error={errors.productId} className="sm:col-span-2">
              {product ? (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span>{product.name}</span>
                  <Button size="xs" variant="ghost" onClick={() => setProduct(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <ProductSearchBox
                  storeId={ops.storeId}
                  placeholder="Search the product"
                  showLocation={false}
                  onPick={(p) => setProduct({ id: p.id, name: p.name })}
                />
              )}
            </Field>
            <Field label="Buy">
              <Input type="number" min={1} value={form.buyQty} onChange={set('buyQty')} />
            </Field>
            <Field label="Get free">
              <Input type="number" min={1} value={form.getQty} onChange={set('getQty')} />
            </Field>
          </>
        )}
        <Field label="Minimum order (₹)">
          <Input value={form.minOrderValue} onChange={set('minOrderValue')} inputMode="decimal" />
        </Field>
        <Field label="Uses per customer">
          <Input type="number" min={1} value={form.usageLimitPerUser} onChange={set('usageLimitPerUser')} placeholder="Unlimited" />
        </Field>
        <Field label="Starts" error={errors.startsAt}>
          <Input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
        </Field>
        <Field label="Ends" error={errors.endsAt}>
          <Input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
        </Field>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-slate-700">Channels (none selected = all)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ORDER_CHANNELS.map((c) => (
              <Chip
                key={c}
                active={form.channels.includes(c)}
                onClick={() =>
                  setForm({ ...form, channels: form.channels.includes(c) ? form.channels.filter((x) => x !== c) : [...form.channels, c] })
                }
              >
                {ORDER_CHANNEL_LABELS[c]}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Banner colour">
          <Input type="color" value={form.bannerColor} onChange={set('bannerColor')} className="p-1" />
        </Field>
        <div className="flex items-end pb-2">
          <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Active" />
        </div>
      </div>
    </Modal>
  );
}
