import {
  PRIORITIES,
  PRIORITY_LABELS,
  SocketEvents,
  describeLocation,
  timeAgo,
  type Priority,
  type RestockAlert,
  type Task,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpFromLine, CheckCheck, ClipboardList, Eye, Siren } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ProductArt } from '@/components/product';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageLoader, Select, Tabs } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { PageHeader, StockBar } from './components';
import { assignableEmployees, useEmployees, useOps } from './hooks';

type View = 'ACTIVE' | 'RESOLVED';

/** Shelf-level restock alerts raised the moment stock drops below the threshold. */
export default function AlertsPage() {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('ACTIVE');
  const [resolving, setResolving] = useState<RestockAlert | null>(null);
  const [assigning, setAssigning] = useState<RestockAlert | null>(null);
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', ops.storeId, view],
    queryFn: () => ops.get<RestockAlert[]>('/alerts', { query: { status: view, limit: 100 } }),
  });
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useSocketEvent<RestockAlert>('STAFF', SocketEvents.ALERT_CHANGED, (alert) => {
    if (alert.storeId !== ops.storeId) return;
    void queryClient.invalidateQueries({ queryKey: ['alerts', ops.storeId] });
    if (alert.status === 'OPEN') {
      setFresh((s) => new Set(s).add(alert.id));
      setTimeout(
        () =>
          setFresh((s) => {
            const next = new Set(s);
            next.delete(alert.id);
            return next;
          }),
        1600,
      );
    }
  });

  const acknowledge = useMutation({
    mutationFn: (alert: RestockAlert) => ops.post<RestockAlert>(`/alerts/${alert.id}/acknowledge`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts', ops.storeId] }),
    onError: (error) => toast.error('Could not acknowledge', errorMessage(error)),
  });

  const open = alerts.filter((a) => a.status === 'OPEN').length;
  const out = alerts.filter((a) => a.level === 'OUT_OF_STOCK').length;

  return (
    <div>
      <PageHeader
        title="Restock alerts"
        subtitle="Raised automatically when a shelf drops to its threshold. Warehouse staff are notified and can restock straight from here."
      />
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'ACTIVE', label: 'Needs action', count: view === 'ACTIVE' ? alerts.length : undefined },
          { value: 'RESOLVED', label: 'Resolved' },
        ]}
      />
      {view === 'ACTIVE' && alerts.length > 0 && (
        <p className="mb-4 text-sm text-slate-600">
          <strong className="text-rose-600">{out}</strong> empty shelves · <strong>{open}</strong> not yet picked up by anyone
        </p>
      )}
      {isLoading ? (
        <PageLoader />
      ) : alerts.length === 0 ? (
        <EmptyState icon="✅" title={view === 'ACTIVE' ? 'All shelves are stocked' : 'No resolved alerts yet'} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={cn(
                'p-4',
                alert.level === 'OUT_OF_STOCK' && alert.status !== 'RESOLVED' && 'border-rose-200',
                fresh.has(alert.id) && 'animate-flash',
              )}
            >
              <div className="flex items-start gap-3">
                <ProductArt emoji={alert.product.emoji} color={alert.product.color} imageUrl={alert.product.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">{alert.product.name}</p>
                    <Badge tone={alert.level === 'OUT_OF_STOCK' ? 'red' : 'orange'}>
                      <Siren className="size-3" /> {alert.level === 'OUT_OF_STOCK' ? 'Shelf empty' : 'Running low'}
                    </Badge>
                    {alert.needsReorder && <Badge tone="violet">Reorder from supplier</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-sky-800">{describeLocation(alert.location, { withLabel: true })}</p>
                  <p className="text-xs text-slate-500">
                    Raised {timeAgo(alert.createdAt)}
                    {alert.acknowledgedBy && ` · picked up by ${alert.acknowledgedBy}`}
                    {alert.resolvedBy && ` · restocked ${alert.restockedQty ?? 0} by ${alert.resolvedBy}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <StockBar shelf={alert.shelfQty} storage={alert.storageQty} threshold={alert.threshold} target={alert.restockTarget} />
                {alert.status !== 'RESOLVED' && (
                  <div className="flex flex-wrap gap-2">
                    {alert.status === 'OPEN' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye className="size-4" />}
                        loading={acknowledge.isPending && acknowledge.variables?.id === alert.id}
                        onClick={() => acknowledge.mutate(alert)}
                      >
                        I'm on it
                      </Button>
                    )}
                    {ops.isSupervisor && !alert.taskId && (
                      <Button size="sm" variant="outline" icon={<ClipboardList className="size-4" />} onClick={() => setAssigning(alert)}>
                        Assign
                      </Button>
                    )}
                    {alert.taskId && (
                      <Link to="/ops/tasks">
                        <Badge tone="blue">Task assigned</Badge>
                      </Link>
                    )}
                    <Button size="sm" icon={<ArrowUpFromLine className="size-4" />} onClick={() => setResolving(alert)}>
                      Restock
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {resolving && <ResolveModal alert={resolving} onClose={() => setResolving(null)} />}
      {assigning && <AssignModal alert={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}

function ResolveModal({ alert, onClose }: { alert: RestockAlert; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const suggested = Math.max(0, Math.min(alert.storageQty, alert.restockTarget - alert.shelfQty));
  const [quantity, setQuantity] = useState(String(suggested));
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: () =>
      ops.post<RestockAlert>(`/alerts/${alert.id}/resolve`, { restockQuantity: Number(quantity) || 0, note: note || undefined }),
    onSuccess: () => {
      toast.success('Shelf restocked', `${alert.product.name}: +${quantity}`);
      void queryClient.invalidateQueries({ queryKey: ['alerts', ops.storeId] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not restock', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Restock and close the alert"
      description={`${alert.product.name} · ${describeLocation(alert.location)}`}
      footer={
        <Button icon={<CheckCheck className="size-4" />} loading={resolve.isPending} onClick={() => resolve.mutate()}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Shelf has <strong>{alert.shelfQty}</strong>, storage has <strong>{alert.storageQty}</strong>. Fill to {alert.restockTarget}.
        </p>
        {alert.storageQty === 0 && (
          <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
            Storage is empty. Close the alert with 0 and raise a supplier reorder.
          </p>
        )}
        <Field label="Units moved to the shelf">
          <Input type="number" min={0} max={alert.storageQty} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AssignModal({ alert, onClose }: { alert: RestockAlert; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useEmployees(ops.storeId);
  const candidates = assignableEmployees(employees, ops).sort(
    (a, b) => Number(b.department === 'WAREHOUSE') - Number(a.department === 'WAREHOUSE'),
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Priority>(alert.level === 'OUT_OF_STOCK' ? 'URGENT' : 'HIGH');
  const assign = useMutation({
    mutationFn: () =>
      ops.post<Task>(`/alerts/${alert.id}/task`, { assigneeId, priority, dueAt: new Date(Date.now() + 30 * 60_000).toISOString() }),
    onSuccess: (task) => {
      toast.success('Task assigned', `${task.assignee.name} has been notified.`);
      void queryClient.invalidateQueries({ queryKey: ['alerts', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not assign', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Assign restock task"
      description={`${alert.product.name} · due in 30 minutes`}
      footer={
        <Button disabled={!assigneeId} loading={assign.isPending} onClick={() => assign.mutate()}>
          Assign
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Assign to">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Choose a team member</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.department === 'WAREHOUSE' ? 'Warehouse' : e.department.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
