import {
  PRIORITIES,
  PRIORITY_LABELS,
  SocketEvents,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  type Employee,
  type Priority,
  type Task,
  type TaskCategory,
} from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, Chip, EmptyState, Field, Loader, Muted, Row, Segmented, Sheet } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, formatTime } from '@/lib/format';
import { useLiveInvalidate, useStaff, useStoreRoom, type StaffContext } from '@/lib/staff';
import { toast } from '@/lib/toast';

type View_ = 'mine' | 'team' | 'review';

const PRIORITY_TONE: Record<Priority, 'gray' | 'blue' | 'yellow' | 'red'> = { LOW: 'gray', MEDIUM: 'blue', HIGH: 'yellow', URGENT: 'red' };

/** Work assigned to me, my team's open work, and completed work waiting for my review. */
export default function StaffTasksScreen() {
  const staff = useStaff();
  const [view, setView] = useState<View_>('mine');
  const [completing, setCompleting] = useState<Task | null>(null);
  const [reviewing, setReviewing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  useStoreRoom(staff?.storeId);
  useLiveInvalidate(SocketEvents.TASK_CHANGED, [['staff-tasks', staff?.storeId]], 600);
  const query =
    view === 'mine'
      ? { scope: 'mine', status: 'TODO,IN_PROGRESS,REOPENED,DONE' }
      : view === 'team'
        ? { scope: staff?.isLeadership ? 'all' : 'team', status: 'TODO,IN_PROGRESS,REOPENED' }
        : { scope: staff?.isLeadership ? 'all' : 'team', status: 'DONE' };
  const {
    data: tasks = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['staff-tasks', staff?.storeId, view],
    queryFn: () => staff!.get<Task[]>('/tasks', { ...query, limit: 100 }),
    enabled: Boolean(staff),
  });
  if (!staff) return <Loader />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            {staff.isSupervisor && (
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'mine', label: 'Mine' },
                  { value: 'team', label: staff.isLeadership ? 'Store' : 'Team' },
                  { value: 'review', label: 'To review' },
                ]}
              />
            )}
            {staff.isSupervisor && <Button title="Assign a task" icon="add" onPress={() => setCreating(true)} />}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Loader />
          ) : (
            <EmptyState
              emoji={view === 'review' ? '🎉' : '📋'}
              title={view === 'review' ? 'Nothing waiting for your review' : 'No tasks here'}
            />
          )
        }
        renderItem={({ item }) => (
          <TaskCard task={item} staff={staff} onComplete={() => setCompleting(item)} onReview={() => setReviewing(item)} />
        )}
      />
      {completing && <CompleteSheet task={completing} staff={staff} onClose={() => setCompleting(null)} />}
      {reviewing && <ReviewSheet task={reviewing} staff={staff} onClose={() => setReviewing(null)} />}
      {creating && <CreateTaskSheet staff={staff} onClose={() => setCreating(false)} />}
    </View>
  );
}

function TaskCard({
  task,
  staff,
  onComplete,
  onReview,
}: {
  task: Task;
  staff: StaffContext;
  onComplete: () => void;
  onReview: () => void;
}) {
  const queryClient = useQueryClient();
  const mine = task.assignee.id === staff.membership.employeeId;
  const canReview = task.status === 'DONE' && (staff.isLeadership || task.assignedBy.id === staff.membership.employeeId);
  const start = useMutation({
    mutationFn: () => staff.post<Task>(`/tasks/${task.id}/start`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['staff-tasks', staff.storeId] }),
    onError: (error) => toast.error('Could not start', errorMessage(error)),
  });
  return (
    <Card style={[task.isOverdue && { borderColor: '#fecdd3' }, task.status === 'REOPENED' && { borderColor: '#fed7aa' }]}>
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge
          label={TASK_STATUS_LABELS[task.status]}
          tone={task.status === 'DONE' ? 'violet' : task.status === 'REOPENED' ? 'yellow' : task.status === 'IN_PROGRESS' ? 'blue' : 'gray'}
        />
        <Badge label={PRIORITY_LABELS[task.priority]} tone={PRIORITY_TONE[task.priority]} />
        <Badge label={TASK_CATEGORY_LABELS[task.category]} />
        {task.isOverdue && <Badge label="⏰ Overdue" tone="red" />}
      </Row>
      <Text style={{ marginTop: space.sm, fontWeight: '700', fontSize: 15, color: colors.ink }}>{task.title}</Text>
      {task.description && <Muted style={{ marginTop: 4 }}>{task.description}</Muted>}
      <Muted style={{ marginTop: space.sm, fontSize: 12 }}>
        {mine ? `From ${task.assignedBy.name}` : `${task.assignee.name}`}
        {task.aisle ? ` · Aisle ${task.aisle}` : ''}
        {task.dueAt ? ` · due ${formatTime(task.dueAt)}` : ''}
      </Muted>
      {task.status === 'REOPENED' && task.review?.comment && <Text style={styles.feedback}>↩︎ {task.review.comment}</Text>}
      {task.status === 'DONE' && task.completionNote && <Text style={styles.remark}>“{task.completionNote}”</Text>}
      <Row style={{ marginTop: space.md }}>
        {mine && (task.status === 'TODO' || task.status === 'REOPENED') && (
          <Button title="Start" size="sm" variant="outline" icon="play" loading={start.isPending} onPress={() => start.mutate()} />
        )}
        {mine && ['TODO', 'IN_PROGRESS', 'REOPENED'].includes(task.status) && (
          <Button title="Mark done" size="sm" icon="checkmark" onPress={onComplete} />
        )}
        {canReview && <Button title="Review" size="sm" icon="star" onPress={onReview} />}
      </Row>
    </Card>
  );
}

function CompleteSheet({ task, staff, onClose }: { task: Task; staff: StaffContext; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const complete = useMutation({
    mutationFn: () => staff.post<Task>(`/tasks/${task.id}/complete`, { note: note.trim() }),
    onSuccess: () => {
      toast.success('Marked as done', `${task.assignedBy.name} will review it.`);
      void queryClient.invalidateQueries({ queryKey: ['staff-tasks', staff.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not complete', errorMessage(error)),
  });
  return (
    <Sheet visible onClose={onClose} title="Mark task as done">
      <Muted style={{ marginBottom: space.md }}>{task.title}</Muted>
      <Field
        label="Remark for your manager"
        hint="What did you do? Anything they should know?"
        value={note}
        onChangeText={setNote}
        placeholder="Restocked 24 units, removed 2 damaged packs."
        multiline
        style={{ height: 110, paddingTop: 12, textAlignVertical: 'top' }}
        autoFocus
      />
      <Button
        title="Submit for review"
        size="lg"
        disabled={note.trim().length < 2}
        loading={complete.isPending}
        onPress={() => complete.mutate()}
      />
    </Sheet>
  );
}

function ReviewSheet({ task, staff, onClose }: { task: Task; staff: StaffContext; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const review = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REOPEN') =>
      staff.post<Task>(`/tasks/${task.id}/review`, {
        decision,
        rating: decision === 'APPROVE' ? rating : undefined,
        comment: comment.trim() || undefined,
      }),
    onSuccess: (updated) => {
      toast.success(updated.status === 'APPROVED' ? 'Work approved' : 'Sent back for rework', `${task.assignee.name} has been notified.`);
      void queryClient.invalidateQueries({ queryKey: ['staff-tasks', staff.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not save the review', errorMessage(error)),
  });
  return (
    <Sheet visible onClose={onClose} title="Review completed work">
      <Text style={{ fontWeight: '700', color: colors.ink }}>{task.title}</Text>
      <View style={styles.remarkBox}>
        <Muted style={{ fontSize: 12 }}>
          {task.assignee.name}'s remark · {task.completedAt ? formatDateTime(task.completedAt) : ''}
        </Muted>
        <Text style={{ color: colors.text, marginTop: 4 }}>{task.completionNote}</Text>
      </View>
      <Text style={styles.label}>Rating</Text>
      <Row gap={4} style={{ marginBottom: space.lg }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityLabel={`${n} stars`} onPress={() => setRating(n)} hitSlop={4}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={n <= rating ? '#f59e0b' : colors.faint} />
          </Pressable>
        ))}
      </Row>
      <Field
        label="Comment"
        hint="Required when sending the task back."
        value={comment}
        onChangeText={setComment}
        placeholder="Great job, the display looks neat."
        multiline
        style={{ height: 90, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <Row>
        <Button
          title="Send back"
          variant="outline"
          icon="arrow-undo"
          style={{ flex: 1 }}
          disabled={comment.trim().length < 3}
          loading={review.isPending && review.variables === 'REOPEN'}
          onPress={() => review.mutate('REOPEN')}
        />
        <Button
          title="Approve"
          icon="checkmark-circle"
          style={{ flex: 1 }}
          loading={review.isPending && review.variables === 'APPROVE'}
          onPress={() => review.mutate('APPROVE')}
        />
      </Row>
    </Sheet>
  );
}

const DUE_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
];

function CreateTaskSheet({ staff, onClose }: { staff: StaffContext; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: employees = [] } = useQuery({
    queryKey: ['staff-employees', staff.storeId],
    queryFn: () => staff.get<Employee[]>('/employees', { limit: 200 }),
    staleTime: 60_000,
  });
  // Managers assign to floor managers and workers; floor managers assign to workers.
  const assignable = employees.filter(
    (e) =>
      e.status === 'ACTIVE' &&
      e.userId &&
      (e.id === staff.membership.employeeId ||
        (staff.isLeadership ? e.role === 'FLOOR_MANAGER' || e.role === 'WORKER' : e.role === 'WORKER')),
  );
  const [form, setForm] = useState({ title: '', description: '', aisle: '' });
  const [category, setCategory] = useState<TaskCategory>('RESTOCK');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [due, setDue] = useState(60);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () =>
      staff.post<Task>('/tasks', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category,
        priority,
        assigneeId,
        dueAt: new Date(Date.now() + due * 60_000).toISOString(),
        aisle: form.aisle ? Number(form.aisle) : undefined,
      }),
    onSuccess: (task) => {
      toast.success('Task assigned', `${task.assignee.name} gets an alert now.`);
      void queryClient.invalidateQueries({ queryKey: ['staff-tasks', staff.storeId] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not assign the task', errorMessage(error));
    },
  });
  return (
    <Sheet visible onClose={onClose} title="Assign a task">
      <Field
        label="What needs doing?"
        value={form.title}
        onChangeText={(title) => setForm({ ...form, title })}
        placeholder="Restock dairy chiller"
        error={errors.title}
      />
      <Field
        label="Details (optional)"
        value={form.description}
        onChangeText={(description) => setForm({ ...form, description })}
        multiline
        style={{ height: 80, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <Text style={styles.label}>Assign to</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {assignable.map((e) => (
          <Chip
            key={e.id}
            label={
              e.id === staff.membership.employeeId ? 'Me' : `${e.name.split(' ')[0]} · ${e.role === 'WORKER' ? 'Worker' : 'Floor mgr'}`
            }
            active={assigneeId === e.id}
            onPress={() => setAssigneeId(e.id)}
          />
        ))}
      </Row>
      <Text style={styles.label}>Category</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {TASK_CATEGORIES.map((c) => (
          <Chip key={c} label={TASK_CATEGORY_LABELS[c]} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </Row>
      <Text style={styles.label}>Priority</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {PRIORITIES.map((p) => (
          <Chip key={p} label={PRIORITY_LABELS[p]} active={priority === p} onPress={() => setPriority(p)} />
        ))}
      </Row>
      <Text style={styles.label}>Due in</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {DUE_OPTIONS.map((o) => (
          <Chip key={o.minutes} label={o.label} active={due === o.minutes} onPress={() => setDue(o.minutes)} />
        ))}
      </Row>
      <Field
        label="Aisle (optional)"
        value={form.aisle}
        onChangeText={(aisle) => setForm({ ...form, aisle: aisle.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Button
        title="Assign task"
        size="lg"
        disabled={form.title.trim().length < 3 || !assigneeId}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  feedback: { marginTop: space.sm, color: '#c2410c', backgroundColor: '#fff7ed', padding: space.sm, borderRadius: radius.sm, fontSize: 13 },
  remark: { marginTop: space.sm, color: colors.text, fontStyle: 'italic', fontSize: 13 },
  remarkBox: { backgroundColor: '#f1f5f9', borderRadius: radius.md, padding: space.md, marginVertical: space.md },
});
