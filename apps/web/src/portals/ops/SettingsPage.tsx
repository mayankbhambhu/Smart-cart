import {
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  generateLayout,
  timeAgo,
  type Device,
  type DeviceType,
  type DeviceWithKey,
  type StoreDetail,
  type StoreSettings,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Power, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StoreMap } from '@/components/StoreMap';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Select,
  Table,
  Tabs,
  Td,
  Th,
  Toggle,
} from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { copyToClipboard, paiseToRupees, rupeesToPaise } from '@/lib/utils';
import { PageHeader } from './components';
import { useOps } from './hooks';

type StoreWithSettings = StoreDetail & { settings: StoreSettings };
type Section = 'store' | 'layout' | 'devices';

export default function SettingsPage() {
  const ops = useOps();
  const [section, setSection] = useState<Section>('store');
  const { data: store, isLoading } = useQuery({
    queryKey: ['ops-settings', ops.storeId],
    queryFn: () => ops.get<StoreWithSettings>('/settings'),
  });
  if (!ops.isLeadership) return <PageHeader title="Store settings" subtitle="Only the store manager or owner can change settings." />;
  if (isLoading || !store) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Store settings" subtitle={`${store.name} · ${store.code}`} />
      <Tabs
        className="mb-5"
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'store', label: 'Store & fees' },
          { value: 'layout', label: 'Aisle layout' },
          { value: 'devices', label: 'Gates, carts & kiosks' },
        ]}
      />
      {section === 'store' && <StoreSection store={store} />}
      {section === 'layout' && <LayoutSection store={store} />}
      {section === 'devices' && <DevicesSection />}
    </div>
  );
}

function StoreSection({ store }: { store: StoreWithSettings }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const s = store.settings;
  const [profile, setProfile] = useState({
    name: store.name,
    phone: store.phone,
    email: store.email ?? '',
    openingTime: store.openingTime,
    closingTime: store.closingTime,
    supportsDelivery: store.supportsDelivery,
    supportsPickup: store.supportsPickup,
    supportsInStore: store.supportsInStore,
  });
  const [fees, setFees] = useState({
    deliveryFee: paiseToRupees(s.deliveryFee),
    freeDeliveryThreshold: paiseToRupees(s.freeDeliveryThreshold),
    handlingFee: paiseToRupees(s.handlingFee),
    smallCartThreshold: paiseToRupees(s.smallCartThreshold),
    smallCartFee: paiseToRupees(s.smallCartFee),
  });
  const [operations, setOperations] = useState({
    deliveryEtaMinutes: String(s.deliveryEtaMinutes),
    deliveryRadiusKm: String(s.deliveryRadiusKm),
    pickupSlotMinutes: String(s.pickupSlotMinutes),
    pickupSlotCapacity: String(s.pickupSlotCapacity),
    pickupLeadMinutes: String(s.pickupLeadMinutes),
    exitPassTtlMinutes: String(s.exitPassTtlMinutes),
    sessionIdleMinutes: String(s.sessionIdleMinutes),
    geofenceMeters: String(s.geofenceMeters),
    autoCreateRestockTasks: s.autoCreateRestockTasks,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      ops.patch<StoreWithSettings>('/settings', {
        ...profile,
        email: profile.email || null,
        settings: {
          deliveryFee: rupeesToPaise(fees.deliveryFee),
          freeDeliveryThreshold: rupeesToPaise(fees.freeDeliveryThreshold),
          handlingFee: rupeesToPaise(fees.handlingFee),
          smallCartThreshold: rupeesToPaise(fees.smallCartThreshold),
          smallCartFee: rupeesToPaise(fees.smallCartFee),
          deliveryEtaMinutes: Number(operations.deliveryEtaMinutes),
          deliveryRadiusKm: Number(operations.deliveryRadiusKm),
          pickupSlotMinutes: Number(operations.pickupSlotMinutes),
          pickupSlotCapacity: Number(operations.pickupSlotCapacity),
          pickupLeadMinutes: Number(operations.pickupLeadMinutes),
          exitPassTtlMinutes: Number(operations.exitPassTtlMinutes),
          sessionIdleMinutes: Number(operations.sessionIdleMinutes),
          geofenceMeters: Number(operations.geofenceMeters),
          autoCreateRestockTasks: operations.autoCreateRestockTasks,
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['ops-settings', ops.storeId], updated);
      toast.success('Settings saved');
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save', errorMessage(error));
    },
  });
  const num =
    (setter: typeof setOperations, state: typeof operations, key: keyof typeof operations) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setter({ ...state, [key]: e.target.value });
  const fee = (key: keyof typeof fees) => (e: React.ChangeEvent<HTMLInputElement>) => setFees({ ...fees, [key]: e.target.value });

  return (
    <form
      className="grid gap-5 xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save.mutate();
      }}
    >
      <Card>
        <CardHeader title="Store profile" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Store name" error={errors.name} className="sm:col-span-2">
            <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          </Field>
          <Field label="Opens" hint="Same open and close time = 24 hours">
            <Input type="time" value={profile.openingTime} onChange={(e) => setProfile({ ...profile, openingTime: e.target.value })} />
          </Field>
          <Field label="Closes">
            <Input type="time" value={profile.closingTime} onChange={(e) => setProfile({ ...profile, closingTime: e.target.value })} />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Toggle
              checked={profile.supportsDelivery}
              onChange={(v) => setProfile({ ...profile, supportsDelivery: v })}
              label="Quick delivery"
            />
            <Toggle
              checked={profile.supportsPickup}
              onChange={(v) => setProfile({ ...profile, supportsPickup: v })}
              label="Scheduled pickup"
            />
            <Toggle
              checked={profile.supportsInStore}
              onChange={(v) => setProfile({ ...profile, supportsInStore: v })}
              label="Scan & Go in store"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fees (₹)" subtitle="Applied to delivery and pickup baskets. Scan & Go has no fees." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Delivery fee">
            <Input value={fees.deliveryFee} onChange={fee('deliveryFee')} inputMode="decimal" />
          </Field>
          <Field label="Free delivery above">
            <Input value={fees.freeDeliveryThreshold} onChange={fee('freeDeliveryThreshold')} inputMode="decimal" />
          </Field>
          <Field label="Handling charge">
            <Input value={fees.handlingFee} onChange={fee('handlingFee')} inputMode="decimal" />
          </Field>
          <div />
          <Field label="Small cart fee">
            <Input value={fees.smallCartFee} onChange={fee('smallCartFee')} inputMode="decimal" />
          </Field>
          <Field label="…for baskets below">
            <Input value={fees.smallCartThreshold} onChange={fee('smallCartThreshold')} inputMode="decimal" />
          </Field>
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="Operations" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Delivery promise (min)">
            <Input type="number" value={operations.deliveryEtaMinutes} onChange={num(setOperations, operations, 'deliveryEtaMinutes')} />
          </Field>
          <Field label="Delivery radius (km)">
            <Input
              type="number"
              step="0.5"
              value={operations.deliveryRadiusKm}
              onChange={num(setOperations, operations, 'deliveryRadiusKm')}
            />
          </Field>
          <Field label="Pickup slot length">
            <Select value={operations.pickupSlotMinutes} onChange={num(setOperations, operations, 'pickupSlotMinutes')}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </Select>
          </Field>
          <Field label="Orders per pickup slot">
            <Input type="number" value={operations.pickupSlotCapacity} onChange={num(setOperations, operations, 'pickupSlotCapacity')} />
          </Field>
          <Field label="Pickup lead time (min)" hint="Packing time before the first slot">
            <Input type="number" value={operations.pickupLeadMinutes} onChange={num(setOperations, operations, 'pickupLeadMinutes')} />
          </Field>
          <Field label="Exit pass valid for (min)">
            <Input type="number" value={operations.exitPassTtlMinutes} onChange={num(setOperations, operations, 'exitPassTtlMinutes')} />
          </Field>
          <Field label="Idle Scan & Go session ends after (min)" hint="Unpaid items go back to stock">
            <Input type="number" value={operations.sessionIdleMinutes} onChange={num(setOperations, operations, 'sessionIdleMinutes')} />
          </Field>
          <Field label="Clock-in geofence (m)" hint="0 turns the location check off">
            <Input type="number" value={operations.geofenceMeters} onChange={num(setOperations, operations, 'geofenceMeters')} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Toggle
              checked={operations.autoCreateRestockTasks}
              onChange={(v) => setOperations({ ...operations, autoCreateRestockTasks: v })}
              label="Automatically assign a restock task to an on-duty warehouse worker when a shelf runs low"
            />
          </div>
        </div>
      </Card>
      <div className="flex justify-end xl:col-span-2">
        <Button type="submit" size="lg" loading={save.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

function LayoutSection({ store }: { store: StoreWithSettings }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [aisles, setAisles] = useState(store.layout.aisles.map((a) => a.label));
  const [rows, setRows] = useState(store.layout.aisles[0]?.rows ?? 6);
  const [shelves, setShelves] = useState(store.layout.aisles[0]?.shelves ?? 5);
  useEffect(() => setAisles(store.layout.aisles.map((a) => a.label)), [store.layout]);
  const preview = useMemo(
    () => generateLayout({ aisles: aisles.map((label) => ({ label: label || 'Aisle' })), rows, shelves }),
    [aisles, rows, shelves],
  );
  const save = useMutation({
    mutationFn: () => ops.put<StoreDetail>('/layout', { aisles: aisles.map((label) => ({ label })), rows, shelves }),
    onSuccess: () => {
      toast.success('Floor plan updated', 'Shoppers get the new aisle numbers and routes immediately.');
      void queryClient.invalidateQueries({ queryKey: ['ops-settings', ops.storeId] });
    },
    onError: (error) => toast.error('Could not save the layout', errorMessage(error)),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader
          title="Aisles"
          subtitle={
            ops.isOwner ? 'Order matches the hanging aisle signs, left to right.' : 'Only the store owner can change the floor plan.'
          }
        />
        <div className="space-y-2 p-5">
          {aisles.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <Input
                value={label}
                onChange={(e) => setAisles(aisles.map((a, j) => (j === i ? e.target.value : a)))}
                disabled={!ops.isOwner}
              />
              {ops.isOwner && aisles.length > 1 && (
                <IconButton label="Remove aisle" onClick={() => setAisles(aisles.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
          ))}
          {ops.isOwner && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => setAisles([...aisles, `Aisle ${aisles.length + 1}`])}
              disabled={aisles.length >= 30}
            >
              Add aisle
            </Button>
          )}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label="Rows (bays) per aisle">
              <Input
                type="number"
                min={2}
                max={20}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value) || 2)}
                disabled={!ops.isOwner}
              />
            </Field>
            <Field label="Shelf levels">
              <Input
                type="number"
                min={1}
                max={8}
                value={shelves}
                onChange={(e) => setShelves(Number(e.target.value) || 1)}
                disabled={!ops.isOwner}
              />
            </Field>
          </div>
          {ops.isOwner && (
            <Button
              block
              className="mt-2"
              loading={save.isPending}
              disabled={aisles.some((a) => a.trim().length < 2)}
              onClick={() => save.mutate()}
            >
              Save floor plan
            </Button>
          )}
          <p className="text-xs text-slate-500">
            Products in a removed aisle move to the last aisle. Update their locations in Inventory afterwards.
          </p>
        </div>
      </Card>
      <Card className="p-4">
        <StoreMap layout={preview} />
      </Card>
    </div>
  );
}

function DevicesSection() {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['ops-devices', ops.storeId],
    queryFn: () => ops.get<Device[]>('/devices'),
  });
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<DeviceWithKey | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['ops-devices', ops.storeId] });
  const rotate = useMutation({
    mutationFn: (device: Device) => ops.post<DeviceWithKey>(`/devices/${device.id}/rotate-key`),
    onSuccess: (device) => {
      setRevealed(device);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (device: Device) => ops.patch<Device>(`/devices/${device.id}`, { isActive: !device.isActive }),
    onSuccess: refresh,
  });
  return (
    <Card>
      <CardHeader
        title="Connected hardware"
        subtitle="Exit gates verify digital receipts, smart carts scan items into a shopper's cart, kiosks show the attendance QR."
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add device
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>Type</Th>
              <Th>Key</Th>
              <Th>Last seen</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <Td className="font-medium text-slate-900">{d.name}</Td>
                <Td>{DEVICE_TYPE_LABELS[d.type]}</Td>
                <Td className="font-mono text-xs">{d.apiKeyPrefix}…</Td>
                <Td className="text-xs text-slate-500">{d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'Never'}</Td>
                <Td>
                  <Badge tone={d.isActive ? 'green' : 'gray'}>{d.isActive ? 'Active' : 'Disabled'}</Badge>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <IconButton label="Rotate key" onClick={() => rotate.mutate(d)}>
                    <KeyRound className="size-4" />
                  </IconButton>
                  <IconButton label={d.isActive ? 'Disable' : 'Enable'} onClick={() => toggle.mutate(d)}>
                    <Power className="size-4" />
                  </IconButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {creating && (
        <NewDeviceModal
          onClose={() => setCreating(false)}
          onCreated={(device) => {
            setCreating(false);
            setRevealed(device);
            refresh();
          }}
        />
      )}
      {revealed && (
        <Modal
          open
          onClose={() => setRevealed(null)}
          title={`API key for ${revealed.name}`}
          description="Copy it into the device now. It is shown only once."
        >
          <div className="flex items-center gap-2 rounded-xl bg-slate-900 p-3 font-mono text-sm break-all text-white">
            <span className="flex-1">{revealed.apiKey}</span>
            <IconButton
              label="Copy"
              className="text-white hover:bg-white/10"
              onClick={() => copyToClipboard(revealed.apiKey).then(() => toast.success('Copied'))}
            >
              <Copy className="size-4" />
            </IconButton>
          </div>
          <p className="mt-3 text-xs text-slate-500">Test it in the browser simulator at /devices.</p>
        </Modal>
      )}
    </Card>
  );
}

function NewDeviceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (device: DeviceWithKey) => void }) {
  const ops = useOps();
  const [type, setType] = useState<DeviceType>('EXIT_GATE');
  const [name, setName] = useState('Exit gate 3');
  const create = useMutation({
    mutationFn: () => ops.post<DeviceWithKey>('/devices', { type, name }),
    onSuccess: onCreated,
    onError: (error) => toast.error('Could not add the device', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a device"
      footer={
        <Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>
          Create and show key
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DEVICE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
