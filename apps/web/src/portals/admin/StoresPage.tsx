import {
  formatMoney,
  formatMoneyCompact,
  formatPhone,
  type AdminStoreRow,
  type CreatedStore,
  type IssuedCredentials,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LocateFixed, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  Select,
  Table,
  Td,
  Th,
  Toggle,
} from '@/components/ui';
import { ApiError, adminApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/lib/utils';
import { useAdminRole } from './hooks';

/** Every store with its owner, team size, wage bill and recent sales. */
export default function StoresPage() {
  const { canManage } = useAdminRole();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminApi.get<AdminStoreRow[]>('/admin/stores'),
  });
  const query = q.trim().toLowerCase();
  const filtered = stores.filter(
    (s) => !query || [s.name, s.code, s.city, s.owner?.name ?? ''].some((v) => v.toLowerCase().includes(query)),
  );
  return (
    <div>
      <PageHeader
        title="Stores & owners"
        subtitle={`${stores.length} stores · ${stores.reduce((sum, s) => sum + s.activeEmployeeCount, 0)} active employees`}
        actions={
          canManage && (
            <Button variant="dark" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Onboard a store
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
            <Input className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, code, city or owner" />
          </div>
        </div>
        {isLoading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🏬" title="No stores found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Owner</Th>
                <Th className="text-right">Team</Th>
                <Th className="text-right">Monthly wages</Th>
                <Th className="text-right">Sales (30 days)</Th>
                <Th>Needs attention</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`/admin/stores/${s.id}`} className="block">
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {s.code} · {s.city}
                      </p>
                    </Link>
                  </Td>
                  <Td>
                    {s.owner ? (
                      <>
                        <p className="text-slate-900">{s.owner.name}</p>
                        <p className="text-xs text-slate-500">{formatPhone(s.owner.phone) || s.owner.email}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">No owner</span>
                    )}
                  </Td>
                  <Td className="tabular text-right">
                    {s.activeEmployeeCount}
                    <span className="text-slate-400">/{s.employeeCount}</span>
                  </Td>
                  <Td className="tabular text-right">{formatMoney(s.monthlyWageBill)}</Td>
                  <Td className="tabular text-right">
                    <p className="font-semibold">{formatMoneyCompact(s.netSales30d)}</p>
                    <p className="text-xs text-slate-500">{s.orders30d} orders</p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.pendingRequests > 0 && <Badge tone="yellow">{s.pendingRequests} login requests</Badge>}
                      {s.openTickets > 0 && <Badge tone="red">{s.openTickets} open requests</Badge>}
                      {s.pendingRequests === 0 && s.openTickets === 0 && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={s.status === 'ACTIVE' ? 'green' : s.status === 'ONBOARDING' ? 'blue' : 'gray'}>
                      {s.status.toLowerCase()}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {creating && <CreateStoreModal owners={stores.flatMap((s) => (s.owner ? [s.owner] : []))} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateStoreModal({ owners, onClose }: { owners: NonNullable<AdminStoreRow['owner']>[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const uniqueOwners = [...new Map(owners.map((o) => [o.userId, o])).values()];
  const [ownerMode, setOwnerMode] = useState<'new' | 'existing'>('new');
  const [form, setForm] = useState({
    code: '',
    name: 'SmartCart ',
    addressLine: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '',
    lat: '',
    lng: '',
    phone: '',
    email: '',
    openingTime: '07:00',
    closingTime: '23:00',
    ownerUserId: uniqueOwners[0]?.userId ?? '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    stockCatalog: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ store: CreatedStore['store']; owner: IssuedCredentials } | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      adminApi.post<CreatedStore>('/admin/stores', {
        code: form.code,
        name: form.name,
        addressLine: form.addressLine,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        lat: Number(form.lat),
        lng: Number(form.lng),
        phone: form.phone,
        email: form.email || undefined,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        stockCatalog: form.stockCatalog,
        ...(ownerMode === 'existing'
          ? { ownerUserId: form.ownerUserId }
          : { newOwner: { fullName: form.ownerName, email: form.ownerEmail, phone: form.ownerPhone } }),
      }),
    onSuccess: (created) => {
      toast.success(`${created.store.name} created`);
      void queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      if (created.ownerCredentials) setCredentials({ store: created.store, owner: created.ownerCredentials });
      else {
        onClose();
        navigate(`/admin/stores/${created.store.id}`);
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not create the store', errorMessage(error));
    },
  });

  if (credentials) {
    const text = `SmartCart Store OS login for ${credentials.store.name}\n${credentials.owner.loginUrl}\nUsername: ${credentials.owner.username}\nTemporary password: ${credentials.owner.temporaryPassword}`;
    return (
      <Modal open onClose={onClose} title="Store created" description="Share the owner's login securely. The password is not shown again.">
        <dl className="space-y-2 rounded-2xl bg-slate-900 p-4 font-mono text-sm text-white">
          <div className="flex justify-between">
            <dt className="text-slate-400">Username</dt>
            <dd>{credentials.owner.username}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Temporary password</dt>
            <dd className="text-amber-300">{credentials.owner.temporaryPassword}</dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-2">
          <Button block icon={<Copy className="size-4" />} onClick={() => copyToClipboard(text).then(() => toast.success('Copied'))}>
            Copy
          </Button>
          <Button
            block
            variant="outline"
            onClick={() => {
              onClose();
              navigate(`/admin/stores/${credentials.store.id}`);
            }}
          >
            Open store
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Onboard a new store"
      description="Creates the store with a standard floor plan, the full catalogue and the owner's login."
      footer={
        <Button variant="dark" loading={create.isPending} onClick={() => create.mutate()}>
          Create store
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Store code" error={errors.code} hint="e.g. BLR-HSR-03">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="font-mono" />
        </Field>
        <Field label="Store name" error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Address" error={errors.addressLine} className="sm:col-span-3">
          <Input value={form.addressLine} onChange={set('addressLine')} placeholder="27th Main Road, HSR Layout Sector 2" />
        </Field>
        <Field label="City" error={errors.city}>
          <Input value={form.city} onChange={set('city')} />
        </Field>
        <Field label="State" error={errors.state}>
          <Input value={form.state} onChange={set('state')} />
        </Field>
        <Field label="PIN code" error={errors.pincode}>
          <Input value={form.pincode} onChange={set('pincode')} maxLength={6} inputMode="numeric" />
        </Field>
        <Field label="Latitude" error={errors.lat}>
          <Input value={form.lat} onChange={set('lat')} placeholder="12.9116" />
        </Field>
        <Field label="Longitude" error={errors.lng}>
          <Input value={form.lng} onChange={set('lng')} placeholder="77.6473" />
        </Field>
        <div className="flex items-end pb-0.5">
          <Button
            variant="ghost"
            size="sm"
            icon={<LocateFixed className="size-4" />}
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) =>
                setForm({ ...form, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
              )
            }
          >
            Use my location
          </Button>
        </div>
        <Field label="Store phone" error={errors.phone}>
          <Input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Store email" error={errors.email}>
          <Input value={form.email} onChange={set('email')} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opens">
            <Input type="time" value={form.openingTime} onChange={set('openingTime')} />
          </Field>
          <Field label="Closes">
            <Input type="time" value={form.closingTime} onChange={set('closingTime')} />
          </Field>
        </div>
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4 sm:col-span-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">Store owner</p>
            <Segmented
              value={ownerMode}
              onChange={setOwnerMode}
              options={[
                { value: 'new', label: 'New owner' },
                { value: 'existing', label: 'Existing owner' },
              ]}
            />
          </div>
          {ownerMode === 'existing' ? (
            <Select value={form.ownerUserId} onChange={set('ownerUserId')}>
              {uniqueOwners.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name} · {o.email}
                </option>
              ))}
            </Select>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name" error={errors['newOwner.fullName'] ?? errors.newOwner}>
                <Input value={form.ownerName} onChange={set('ownerName')} />
              </Field>
              <Field label="Email" error={errors['newOwner.email']}>
                <Input value={form.ownerEmail} onChange={set('ownerEmail')} />
              </Field>
              <Field label="Phone" error={errors['newOwner.phone']}>
                <Input value={form.ownerPhone} onChange={set('ownerPhone')} />
              </Field>
            </div>
          )}
        </div>
        <div className="sm:col-span-3">
          <Toggle
            checked={form.stockCatalog}
            onChange={(v) => setForm({ ...form, stockCatalog: v })}
            label="Stock the full SmartCart catalogue with starter quantities"
          />
        </div>
      </div>
    </Modal>
  );
}
