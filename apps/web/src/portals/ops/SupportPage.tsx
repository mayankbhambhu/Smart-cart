import {
  PRIORITIES,
  PRIORITY_LABELS,
  SocketEvents,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  timeAgo,
  type Priority,
  type Ticket,
  type TicketCategory,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus } from 'lucide-react';
import { useState } from 'react';
import { TicketThread } from '@/components/tickets';
import { Button, Card, Drawer, EmptyState, Field, Input, Modal, PageLoader, Select, Tabs, Textarea } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { PageHeader, PriorityBadge, TicketStatusBadge } from './components';
import { useEmployees, useLiveInvalidate, useOps } from './hooks';

type View = 'open' | 'closed';

/** Requests from the store to the SmartCart team: hardware, payments, staffing, offboarding… */
export default function SupportPage() {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('open');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['ops-tickets', ops.storeId, view],
    queryFn: () =>
      ops.get<Ticket[]>('/tickets', {
        query: { status: view === 'open' ? 'OPEN,IN_PROGRESS,WAITING_ON_STORE' : 'RESOLVED,CLOSED', limit: 100 },
      }),
  });
  const { data: ticket } = useQuery({
    queryKey: ['ops-ticket', openId],
    queryFn: () => ops.get<Ticket>(`/tickets/${openId}`),
    enabled: Boolean(openId),
  });
  useLiveInvalidate([SocketEvents.TICKET_CHANGED], [['ops-tickets', ops.storeId], ['ops-ticket']], 400);
  const reply = useMutation({
    mutationFn: (body: string) => ops.post<Ticket>(`/tickets/${openId}/messages`, { body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['ops-ticket', openId], updated);
      void queryClient.invalidateQueries({ queryKey: ['ops-tickets', ops.storeId] });
    },
    onError: (error) => toast.error('Could not send', errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="SmartCart support"
        subtitle="Raise any issue with the SmartCart team and follow the conversation here."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New request
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Resolved' },
        ]}
      />
      {isLoading ? (
        <PageLoader />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="🛟"
          title={view === 'open' ? 'No open requests' : 'Nothing resolved yet'}
          body="Gate not opening? Payment settlement question? Let us know."
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{t.subject}</p>
                <p className="text-xs text-slate-500">
                  {t.ticketNumber} · {TICKET_CATEGORY_LABELS[t.category]} · {t.raisedBy.name} · updated {timeAgo(t.updatedAt)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <MessageSquare className="size-3.5" /> {t.messageCount}
              </span>
              <PriorityBadge priority={t.priority} />
              <TicketStatusBadge status={t.status} />
            </button>
          ))}
        </Card>
      )}
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} width="max-w-2xl" title="Request">
        {ticket ? (
          <TicketThread ticket={ticket} viewer="STORE" onReply={(body) => reply.mutate(body)} sending={reply.isPending} />
        ) : (
          <PageLoader />
        )}
      </Drawer>
      {creating && <NewTicketModal onClose={() => setCreating(false)} onCreated={(t) => setOpenId(t.id)} />}
    </div>
  );
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ticket: Ticket) => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useEmployees(ops.storeId);
  const [form, setForm] = useState({
    category: 'TECHNICAL' as TicketCategory,
    priority: 'MEDIUM' as Priority,
    subject: '',
    description: '',
    relatedEmployeeId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => ops.post<Ticket>('/tickets', { ...form, relatedEmployeeId: form.relatedEmployeeId || undefined }),
    onSuccess: (ticket) => {
      toast.success(`Request ${ticket.ticketNumber} sent`, 'The SmartCart team usually replies within a few hours.');
      void queryClient.invalidateQueries({ queryKey: ['ops-tickets', ops.storeId] });
      onClose();
      onCreated(ticket);
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not send', errorMessage(error));
    },
  });
  const aboutEmployee = form.category === 'STAFFING' || form.category === 'EMPLOYEE_OFFBOARDING';
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New request to SmartCart"
      footer={
        <Button loading={create.isPending} onClick={() => create.mutate()}>
          Send request
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        {aboutEmployee && (
          <Field label="Employee" className="sm:col-span-2">
            <Select value={form.relatedEmployeeId} onChange={(e) => setForm({ ...form, relatedEmployeeId: e.target.value })}>
              <option value="">Not about a specific person</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.employeeCode}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Subject" error={errors.subject} className="sm:col-span-2">
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Exit gate 2 is not reading QR codes"
            autoFocus
          />
        </Field>
        <Field label="Describe the issue" error={errors.description} className="sm:col-span-2">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-32"
            placeholder="What happened, since when, and what you have tried"
          />
        </Field>
      </div>
    </Modal>
  );
}
