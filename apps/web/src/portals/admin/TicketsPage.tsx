import {
  PRIORITIES,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  timeAgo,
  type AdminStoreRow,
  type Priority,
  type Ticket,
  type TicketCategory,
  type TicketStatus,
} from '@smartcart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PriorityBadge, TicketStatusBadge } from '@/components/status';
import { TicketThread } from '@/components/tickets';
import { Card, Drawer, EmptyState, Field, PageHeader, PageLoader, Select, Tabs } from '@/components/ui';
import { adminApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';

type View = 'open' | 'waiting' | 'resolved';
const STATUS: Record<View, string> = { open: 'OPEN,IN_PROGRESS', waiting: 'WAITING_ON_STORE', resolved: 'RESOLVED,CLOSED' };

interface AdminMember {
  id: string;
  name: string;
  email: string | null;
  adminRole: string | null;
}

/** Requests from stores: hardware, payments, staffing, offboarding and anything else. */
export default function TicketsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('open');
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets', view, storeId, category],
    queryFn: () =>
      adminApi.get<Ticket[]>('/admin/tickets', {
        query: { status: STATUS[view], storeId: storeId || undefined, category: category || undefined, limit: 100 },
      }),
    placeholderData: keepPreviousData,
  });
  const { data: stores = [] } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.get<AdminStoreRow[]>('/admin/stores') });
  const { data: admins = [] } = useQuery({
    queryKey: ['admin-team'],
    queryFn: () => adminApi.get<AdminMember[]>('/admin/admins'),
    staleTime: 10 * 60_000,
  });
  const { data: ticket } = useQuery({
    queryKey: ['admin-tickets', 'detail', openId],
    queryFn: () => adminApi.get<Ticket>(`/admin/tickets/${openId}`),
    enabled: Boolean(openId),
  });

  const refresh = (updated: Ticket) => {
    queryClient.setQueryData(['admin-tickets', 'detail', updated.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };
  const update = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: Priority; assignedAdminId?: string | null }) =>
      adminApi.patch<Ticket>(`/admin/tickets/${openId}`, patch),
    onSuccess: refresh,
    onError: (error) => toast.error('Could not update', errorMessage(error)),
  });
  const reply = useMutation({
    mutationFn: ({ body, isInternal }: { body: string; isInternal: boolean }) =>
      adminApi.post<Ticket>(`/admin/tickets/${openId}/messages`, { body, isInternal }),
    onSuccess: refresh,
    onError: (error) => toast.error('Could not send', errorMessage(error)),
  });

  return (
    <div>
      <PageHeader title="Store requests" subtitle="Everything stores have asked the SmartCart team for" />
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'open', label: 'Open' },
          { value: 'waiting', label: 'Waiting on store' },
          { value: 'resolved', label: 'Resolved' },
        ]}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3">
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-56" aria-label="Store">
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory | '')}
            className="w-56"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <PageLoader />
        ) : tickets.length === 0 ? (
          <EmptyState icon="✅" title="Nothing here" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{t.subject}</p>
                    <p className="text-xs text-slate-500">
                      {t.ticketNumber} · {t.storeName} · {TICKET_CATEGORY_LABELS[t.category]} · {t.raisedBy.name} · {timeAgo(t.updatedAt)}
                      {t.assignedAdmin && ` · ${t.assignedAdmin.name}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <MessageSquare className="size-3.5" /> {t.messageCount}
                  </span>
                  <PriorityBadge priority={t.priority} />
                  <TicketStatusBadge status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} width="max-w-3xl" title="Store request">
        {ticket ? (
          <div className="flex h-full flex-col">
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
              <Field label="Status">
                <Select value={ticket.status} onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })}>
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={ticket.priority} onChange={(e) => update.mutate({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Handled by">
                <Select value={ticket.assignedAdmin?.id ?? ''} onChange={(e) => update.mutate({ assignedAdminId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {ticket.category === 'EMPLOYEE_OFFBOARDING' && ticket.relatedEmployee && (
                <p className="text-sm text-slate-600 sm:col-span-3">
                  Offboarding request for <strong>{ticket.relatedEmployee.name}</strong>.{' '}
                  <Link to="/admin/employees" className="font-semibold text-indigo-700">
                    Delete the login in Employees →
                  </Link>
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <TicketThread
                ticket={ticket}
                viewer="ADMIN"
                onReply={(body, isInternal) => reply.mutate({ body, isInternal })}
                sending={reply.isPending}
              />
            </div>
          </div>
        ) : (
          <PageLoader />
        )}
      </Drawer>
    </div>
  );
}
