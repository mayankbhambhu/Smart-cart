import {
  DEVICE_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  STORE_STATUSES,
  WAGE_TYPE_LABELS,
  formatMoney,
  formatPhone,
  timeAgo,
  type AdminStoreDetail,
  type StoreStatus,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { StoreMap } from '@/components/StoreMap';
import { Badge, Card, CardHeader, ErrorState, PageHeader, PageLoader, Select, Stat, Table, Td, Th } from '@/components/ui';
import { adminApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { useAdminRole } from './hooks';

/** One store: owner, KPIs, the full employee list with wages, devices and floor plan. */
export default function StoreDetailPage() {
  const { storeId } = useParams();
  const { canManage } = useAdminRole();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-store', storeId],
    queryFn: () => adminApi.get<AdminStoreDetail>(`/admin/stores/${storeId}`),
  });
  const setStatus = useMutation({
    mutationFn: (status: StoreStatus) => adminApi.patch(`/admin/stores/${storeId}`, { status }),
    onSuccess: () => {
      toast.success('Store status updated');
      void queryClient.invalidateQueries({ queryKey: ['admin-store', storeId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
    },
    onError: (err) => toast.error('Could not update', errorMessage(err)),
  });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  const { store, owner, employees, devices, stats } = data;
  const current = employees.filter((e) => e.status === 'ACTIVE' || e.status === 'ON_LEAVE');
  const former = employees.filter((e) => e.status === 'LEFT' || e.status === 'TERMINATED');

  return (
    <div>
      <Link to="/admin/stores" className="text-sm font-semibold text-indigo-700">
        ← Stores
      </Link>
      <PageHeader
        title={store.name}
        subtitle={`${store.code} · ${store.addressLine}, ${store.city} ${store.pincode}`}
        actions={
          canManage ? (
            <Select
              value={store.status}
              onChange={(e) => setStatus.mutate(e.target.value as StoreStatus)}
              className="w-40"
              aria-label="Status"
            >
              {STORE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone={store.status === 'ACTIVE' ? 'green' : 'gray'}>{store.status}</Badge>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Net sales (30 days)" value={formatMoney(stats.netSales30d)} tone="success" />
        <Stat label="Gross profit (30 days)" value={formatMoney(stats.grossProfit30d)} />
        <Stat label="Orders (30 days)" value={stats.orders30d} />
        <Stat label="Open store requests" value={stats.openTickets} tone={stats.openTickets > 0 ? 'danger' : 'default'} />
        <Stat label="Login requests in review" value={stats.pendingRequests} tone={stats.pendingRequests > 0 ? 'warning' : 'default'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title={`Employees (${current.length})`}
            subtitle={`Monthly wage bill ≈ ${formatMoney(current.reduce((sum, e) => sum + (e.wageType === 'MONTHLY' ? (e.wageAmount ?? 0) : e.wageType === 'DAILY' ? (e.wageAmount ?? 0) * 26 : (e.wageAmount ?? 0) * 208), 0))}`}
          />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Phone</Th>
                <Th>Joined</Th>
                <Th className="text-right">Wage</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {[...current, ...former].map((e) => (
                <tr key={e.id} className={e.status === 'LEFT' || e.status === 'TERMINATED' ? 'opacity-60' : undefined}>
                  <Td>
                    <p className="font-medium text-slate-900">{e.name}</p>
                    <p className="text-xs text-slate-500">
                      {e.employeeCode} · {e.username ?? 'no login'}
                    </p>
                  </Td>
                  <Td>{STAFF_ROLE_LABELS[e.role]}</Td>
                  <Td className="whitespace-nowrap">{formatPhone(e.phone)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(e.joiningDate)}</Td>
                  <Td className="tabular text-right whitespace-nowrap">
                    {e.wageAmount !== null && e.wageType ? (
                      <>
                        {formatMoney(e.wageAmount)} <span className="text-xs text-slate-400">{WAGE_TYPE_LABELS[e.wageType]}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <Badge tone={e.status === 'ACTIVE' ? 'green' : e.status === 'ON_LEAVE' ? 'yellow' : 'gray'}>
                      {EMPLOYEE_STATUS_LABELS[e.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Owner</p>
            {owner ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="text-lg font-bold text-slate-900">{owner.name}</p>
                {owner.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="size-4 text-slate-400" /> {formatPhone(owner.phone)}
                  </p>
                )}
                {owner.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="size-4 text-slate-400" /> {owner.email}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No owner linked.</p>
            )}
            <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-slate-400" /> {store.lat.toFixed(4)}, {store.lng.toFixed(4)}
              </p>
              <p>
                Hours {store.openingTime === store.closingTime ? '24×7' : `${store.openingTime}–${store.closingTime}`} · {store.phone}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {store.supportsDelivery && <Badge tone="green">Delivery · {store.settings.deliveryEtaMinutes} min</Badge>}
                {store.supportsPickup && <Badge tone="blue">Pickup</Badge>}
                {store.supportsInStore && <Badge tone="violet">Scan &amp; Go</Badge>}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Devices" />
            <ul className="divide-y divide-slate-100">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{d.name}</span>
                    <span className="block text-xs text-slate-500">{DEVICE_TYPE_LABELS[d.type]}</span>
                  </span>
                  <span className="text-right text-xs text-slate-500">
                    <Badge tone={d.isActive ? 'green' : 'gray'}>{d.isActive ? 'Active' : 'Off'}</Badge>
                    <span className="block">{d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'never seen'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-3">
            <StoreMap layout={store.layout} />
          </Card>
        </div>
      </div>
    </div>
  );
}
