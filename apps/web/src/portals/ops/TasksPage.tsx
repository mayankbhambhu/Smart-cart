import {
  PRIORITIES,
  PRIORITY_LABELS,
  STAFF_ROLE_LABELS,
  SocketEvents,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  timeAgo,
  type Priority,
  type Task,
  type TaskCategory,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, MapPin, MessageSquareText, Play, Plus, RotateCcw, Star, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageLoader, Select, Tabs, Textarea } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader, PriorityBadge, TaskStatusBadge } from './components';
import { assignableEmployees, useEmployees, useLiveInvalidate, useOps } from './hooks';

type View = 'mine' | 'assigned' | 'review' | 'history';

/** Work assignment: managers assign, the assignee is alerted, leaves a remark when done, and the manager reviews it. */
export default function TasksPage() {
  const ops = useOps();
  const [view, setView] = useState<View>('mine');
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<Task | null>(null);
  const [reviewing, setReviewing] = useState<Task | null>(null);

  const query = (() => {
    switch (view) {
      case 'mine':
        return { scope: 'mine', status: 'TODO,IN_PROGRESS,REOPENED,DONE' };
      case 'assigned':
        return { scope: ops.isLeadership ? 'all' : 'team', status: 'TODO,IN_PROGRESS,REOPENED' };
      case 'review':
        return { scope: ops.isLeadership ? 'all' : 'team', status: 'DONE' };
      case 'history':
        return { scope: ops.isSupervisor ? (ops.isLeadership ? 'all' : 'team') : 'mine', status: 'APPROVED,CANCELLED' };
    }
  })();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', ops.storeId, view],
    queryFn: () => ops.get<Task[]>('/tasks', { query: { ...query, limit: 150 } }),
  });
  const { data: reviewCount = [] } = useQuery({
    queryKey: ['tasks', ops.storeId, 'review'],
    queryFn: () => ops.get<Task[]>('/tasks', { query: { scope: ops.isLeadership ? 'all' : 'team', status: 'DONE', limit: 150 } }),
    enabled: ops.isSupervisor,
  });
  useLiveInvalidate([SocketEvents.TASK_CHANGED], [['tasks', ops.storeId]], 600);

  const tabs: { value: View; label: string; count?: number }[] = [{ value: 'mine', label: 'My tasks' }];
  if (ops.isSupervisor) {
    tabs.push({ value: 'assigned', label: ops.isLeadership ? 'Open in store' : 'My team' });
    tabs.push({ value: 'review', label: 'To review', count: reviewCount.length });
  }
  tabs.push({ value: 'history', label: 'History' });

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Assigned work, completion remarks and reviews"
        actions={
          ops.isSupervisor && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Assign a task
            </Button>
          )
        }
      />
      <Tabs className="mb-5" value={view} onChange={setView} tabs={tabs} />
      {isLoading ? (
        <PageLoader />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={view === 'review' ? '🎉' : '📋'}
          title={view === 'review' ? 'Nothing waiting for your review' : 'No tasks here'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onComplete={() => setCompleting(task)} onReview={() => setReviewing(task)} />
          ))}
        </div>
      )}
      {creating && <CreateTaskModal onClose={() => setCreating(false)} />}
      {completing && <CompleteModal task={completing} onClose={() => setCompleting(null)} />}
      {reviewing && <ReviewModal task={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function TaskCard({ task, onComplete, onReview }: { task: Task; onComplete: () => void; onReview: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const mine = task.assignee.id === ops.membership.employeeId;
  const assignedByMe = task.assignedBy.id === ops.membership.employeeId;
  const canReview = task.status === 'DONE' && (ops.isLeadership || assignedByMe);
  const canCancel = (ops.isLeadership || assignedByMe) && ['TODO', 'IN_PROGRESS', 'REOPENED'].includes(task.status);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['tasks', ops.storeId] });
  const start = useMutation({
    mutationFn: () => ops.post<Task>(`/tasks/${task.id}/start`),
    onSuccess: refresh,
    onError: (e) => toast.error('Could not start', errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => ops.patch<Task>(`/tasks/${task.id}`, { status: 'CANCELLED' }),
    onSuccess: () => {
      toast.success('Task cancelled');
      refresh();
    },
  });

  return (
    <Card className={cn('p-4', task.isOverdue && 'border-rose-200', task.status === 'REOPENED' && 'border-orange-200')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <Badge tone="gray">{TASK_CATEGORY_LABELS[task.category]}</Badge>
            {task.isOverdue && (
              <Badge tone="red">
                <AlarmClock className="size-3" /> Overdue
              </Badge>
            )}
          </div>
          <p className="mt-2 font-semibold text-slate-900">{task.title}</p>
          {task.description && <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{task.description}</p>}
        </div>
        {canCancel && (
          <button type="button" className="text-slate-300 hover:text-rose-600" aria-label="Cancel task" onClick={() => cancel.mutate()}>
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Avatar name={task.assignee.name} size="xs" />
          {mine ? 'You' : task.assignee.name} · {STAFF_ROLE_LABELS[task.assignee.role]}
        </span>
        <span>
          by {task.assignedBy.id === ops.membership.employeeId ? 'you' : task.assignedBy.name} · {timeAgo(task.createdAt)}
        </span>
        {task.dueAt && <span className={cn(task.isOverdue && 'font-semibold text-rose-600')}>Due {formatDateTime(task.dueAt)}</span>}
        {task.aisle && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> Aisle {task.aisle}
          </span>
        )}
      </div>

      {task.completionNote && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <MessageSquareText className="size-3.5" /> Remark from {mine ? 'you' : task.assignee.name.split(' ')[0]} ·{' '}
            {task.completedAt && formatDateTime(task.completedAt)}
          </p>
          <p className="mt-1 text-slate-800">{task.completionNote}</p>
          {task.completionPhotoUrl && (
            <a
              href={task.completionPhotoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-brand-700"
            >
              View photo
            </a>
          )}
        </div>
      )}
      {task.review && (
        <div className={cn('mt-3 rounded-xl p-3 text-sm', task.status === 'REOPENED' ? 'bg-orange-50' : 'bg-brand-50')}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            {task.status === 'REOPENED' ? 'Sent back' : 'Approved'} by {task.review.reviewerName}
            {task.review.rating && (
              <span className="flex text-amber-500">
                {Array.from({ length: task.review.rating }, (_, i) => (
                  <Star key={i} className="size-3 fill-current" />
                ))}
              </span>
            )}
          </p>
          {task.review.comment && <p className="mt-1 text-slate-800">{task.review.comment}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {mine && (task.status === 'TODO' || task.status === 'REOPENED') && (
          <Button size="sm" variant="outline" icon={<Play className="size-3.5" />} loading={start.isPending} onClick={() => start.mutate()}>
            Start
          </Button>
        )}
        {mine && ['TODO', 'IN_PROGRESS', 'REOPENED'].includes(task.status) && (
          <Button size="sm" icon={<CheckCircle2 className="size-3.5" />} onClick={onComplete}>
            Mark done
          </Button>
        )}
        {canReview && (
          <Button size="sm" icon={<Star className="size-3.5" />} onClick={onReview}>
            Review work
          </Button>
        )}
      </div>
    </Card>
  );
}

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useEmployees(ops.storeId);
  const candidates = assignableEmployees(employees, ops);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'OTHER' as TaskCategory,
    priority: 'MEDIUM' as Priority,
    assigneeId: '',
    due: '',
    aisle: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () =>
      ops.post<Task>('/tasks', {
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        priority: form.priority,
        assigneeId: form.assigneeId,
        dueAt: form.due ? new Date(form.due).toISOString() : undefined,
        aisle: form.aisle ? Number(form.aisle) : undefined,
      }),
    onSuccess: (task) => {
      toast.success('Task assigned', `${task.assignee.name} gets an alert now.`);
      void queryClient.invalidateQueries({ queryKey: ['tasks', ops.storeId] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not assign', errorMessage(error));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Assign a task"
      size="lg"
      footer={
        <Button loading={create.isPending} disabled={!form.title || !form.assigneeId} onClick={() => create.mutate()}>
          Assign and notify
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What needs doing?" error={errors.title} className="sm:col-span-2">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Face up the dairy chiller"
            autoFocus
          />
        </Field>
        <Field label="Details" className="sm:col-span-2">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Anything the assignee should know"
          />
        </Field>
        <Field label="Assign to" error={errors.assigneeId}>
          <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
            <option value="">Choose a team member</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {STAFF_ROLE_LABELS[e.role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABELS[c]}
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
        <Field label="Due" error={errors.dueAt}>
          <Input type="datetime-local" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        </Field>
        <Field label="Aisle (optional)">
          <Input type="number" min={1} value={form.aisle} onChange={(e) => setForm({ ...form, aisle: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function CompleteModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const complete = useMutation({
    mutationFn: () => ops.post<Task>(`/tasks/${task.id}/complete`, { note }),
    onSuccess: () => {
      toast.success('Marked as done', `${task.assignedBy.name} will review it.`);
      void queryClient.invalidateQueries({ queryKey: ['tasks', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not complete', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Mark task as done"
      description={task.title}
      footer={
        <Button loading={complete.isPending} disabled={note.trim().length < 2} onClick={() => complete.mutate()}>
          Submit for review
        </Button>
      }
    >
      <Field label="Remark for your manager" hint="What did you do? Anything they should know?">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Restocked 24 units, removed 2 damaged packs."
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function ReviewModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const review = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REOPEN') =>
      ops.post<Task>(`/tasks/${task.id}/review`, {
        decision,
        rating: decision === 'APPROVE' ? rating : undefined,
        comment: comment || undefined,
      }),
    onSuccess: (updated) => {
      toast.success(updated.status === 'APPROVED' ? 'Work approved' : 'Sent back for rework', `${task.assignee.name} has been notified.`);
      void queryClient.invalidateQueries({ queryKey: ['tasks', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not save the review', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Review completed work"
      description={task.title}
      footer={
        <>
          <Button
            variant="outline"
            icon={<RotateCcw className="size-4" />}
            disabled={comment.trim().length < 3}
            loading={review.isPending && review.variables === 'REOPEN'}
            onClick={() => review.mutate('REOPEN')}
          >
            Send back
          </Button>
          <Button
            icon={<CheckCircle2 className="size-4" />}
            loading={review.isPending && review.variables === 'APPROVE'}
            onClick={() => review.mutate('APPROVE')}
          >
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold text-slate-500">
            {task.assignee.name}'s remark · {task.completedAt && formatDateTime(task.completedAt)}
          </p>
          <p className="mt-1 text-slate-800">{task.completionNote}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Rating</p>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star className={cn('size-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
              </button>
            ))}
          </div>
        </div>
        <Field label="Comment" hint="Required when sending the task back.">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Great job, the display looks neat." />
        </Field>
      </div>
    </Modal>
  );
}
