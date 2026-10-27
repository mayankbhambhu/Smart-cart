import { STAFF_ROLE_LABELS, timeAgo, type AdminStoreRow, type CredentialRequest, type Paginated } from '@smartcart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { RequestStatusBadge } from '@/components/status';
import { Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Table, Tabs, Td, Th } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { formatDate, useDebounced } from '@/lib/utils';

type View = 'mine' | 'store' | 'approved' | 'closed';
const STATUS: Record<View, string> = {
  mine: 'PENDING_ADMIN',
  store: 'PENDING_OWNER,OWNER_CHANGES_REQUESTED,ADMIN_CHANGES_REQUESTED',
  approved: 'APPROVED',
  closed: 'REJECTED,CANCELLED',
};

/** Login (credential) requests raised by store managers and approved by owners. */
export default function RequestsPage() {
  const [view, setView] = useState<View>('mine');
  const [storeId, setStoreId] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const search = useDebounced(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-requests', view, storeId, search, limit],
    queryFn: () =>
      adminApi.get<Paginated<CredentialRequest>>('/admin/requests', {
        query: { status: STATUS[view], storeId: storeId || undefined, q: search || undefined, limit },
      }),
    placeholderData: keepPreviousData,
  });
  const { data: stores = [] } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.get<AdminStoreRow[]>('/admin/stores') });

  return (
    <div>
      <PageHeader
        title="Login requests"
        subtitle="Each new employee is requested by the store manager, approved by the owner, then approved here, which issues their login."
      />
      <Tabs
        className="mb-4"
        value={view}
        onChange={(v) => {
          setView(v);
          setLimit(50);
        }}
        tabs={[
          { value: 'mine', label: 'Waiting for SmartCart', count: view === 'mine' ? data?.total : undefined },
          { value: 'store', label: 'With the store' },
          { value: 'approved', label: 'Approved' },
          { value: 'closed', label: 'Rejected / cancelled' },
        ]}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
            <Input
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, phone or request number"
            />
          </div>
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-56" aria-label="Store">
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <PageLoader />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="📭" title="No requests here" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Request</Th>
                <Th>New employee</Th>
                <Th>Store</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`/admin/requests/${r.id}`} className="font-mono text-sm font-semibold text-indigo-700">
                      {r.requestNumber}
                    </Link>
                    {r.revision > 1 && <span className="block text-xs text-slate-400">revision {r.revision}</span>}
                  </Td>
                  <Td>
                    <Link to={`/admin/requests/${r.id}`}>
                      <p className="font-medium text-slate-900">{r.candidate.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {r.candidate.email} · joins {formatDate(r.candidate.joiningDate)}
                      </p>
                    </Link>
                  </Td>
                  <Td>
                    <p>{r.storeName}</p>
                    <p className="text-xs text-slate-500">by {r.requestedBy.name}</p>
                  </Td>
                  <Td>{STAFF_ROLE_LABELS[r.candidate.role]}</Td>
                  <Td>
                    <RequestStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-xs text-slate-500">{timeAgo(r.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > data.items.length && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(limit + 50)}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
