import { STAFF_ROLE_LABELS, formatDuration, type Employee, type Shift, type ShiftTemplate } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, Card, Chip, EmptyState, Field, IconButton, Input, Modal, PageLoader, Select } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { WEEKDAY_SHORT, addDays, cn, formatDate, formatTime, localDate, startOfWeek, timeOfDay } from '@/lib/utils';
import { PageHeader } from './components';
import { useEmployees, useOps } from './hooks';

/** Weekly roster: who works when, with attendance overlaid on past shifts. */
export default function ShiftsPage() {
  const ops = useOps();
  const [weekStart, setWeekStart] = useState(startOfWeek(localDate()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6]!;
  const today = localDate();
  const [planning, setPlanning] = useState<{ employeeIds: string[]; dates: string[] } | null>(null);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts', ops.storeId, weekStart],
    queryFn: () => ops.get<Shift[]>('/shifts', { query: { from: weekStart, to: weekEnd } }),
  });
  const { data: employees = [] } = useEmployees(ops.storeId);
  const team = ops.isLeadership
    ? employees.filter((e) => e.status === 'ACTIVE' && e.role !== 'OWNER')
    : employees.filter((e) => e.id === ops.membership.employeeId);
  const byCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (shift.status === 'CANCELLED') continue;
      const key = `${shift.employee.id}:${shift.date}`;
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [shifts]);
  const scheduledMinutes = (employeeId: string) =>
    shifts
      .filter((s) => s.employee.id === employeeId && s.status === 'SCHEDULED')
      .reduce((sum, s) => sum + (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60_000 - s.breakMinutes, 0);

  return (
    <div>
      <PageHeader
        title="Shifts"
        subtitle={ops.isLeadership ? 'Plan the weekly roster. Employees get a notification for new shifts.' : 'Your roster for the week'}
        actions={
          ops.isLeadership && (
            <>
              <Button variant="outline" icon={<Settings2 className="size-4" />} onClick={() => setTemplatesOpen(true)}>
                Shift templates
              </Button>
              <Button
                icon={<CalendarPlus className="size-4" />}
                onClick={() => setPlanning({ employeeIds: [], dates: days.filter((d) => d >= today) })}
              >
                Plan shifts
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <p className="min-w-56 text-center font-semibold text-slate-800">
          {formatDate(weekStart, { year: undefined })} – {formatDate(weekEnd)}
        </p>
        <IconButton label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="size-5" />
        </IconButton>
        {weekStart !== startOfWeek(today) && (
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(today))}>
            This week
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : team.length === 0 ? (
        <EmptyState icon="🗓️" title="No team members yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-56 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">
                  Team member
                </th>
                {days.map((d, i) => (
                  <th
                    key={d}
                    className={cn(
                      'border-b border-l border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold uppercase',
                      d === today ? 'text-brand-700' : 'text-slate-500',
                    )}
                  >
                    {WEEKDAY_SHORT[(i + 1) % 7]} {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((employee) => (
                <tr key={employee.id}>
                  <td className="border-b border-slate-100 px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={employee.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{employee.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {STAFF_ROLE_LABELS[employee.role]} · {formatDuration(scheduledMinutes(employee.id))}
                        </p>
                      </div>
                    </div>
                  </td>
                  {days.map((date) => {
                    const cell = byCell.get(`${employee.id}:${date}`) ?? [];
                    return (
                      <td
                        key={date}
                        className={cn('h-16 border-b border-l border-slate-100 p-1 align-top', date === today && 'bg-brand-50/40')}
                      >
                        <div className="space-y-1">
                          {cell.map((shift) => (
                            <ShiftChip
                              key={shift.id}
                              shift={shift}
                              today={today}
                              onClick={ops.isLeadership ? () => setEditing(shift) : undefined}
                            />
                          ))}
                          {ops.isLeadership && cell.length === 0 && date >= today && (
                            <button
                              type="button"
                              onClick={() => setPlanning({ employeeIds: [employee.id], dates: [date] })}
                              className="flex h-12 w-full items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                              aria-label={`Add shift for ${employee.name}`}
                            >
                              <Plus className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {planning && <PlanModal initial={planning} days={days} team={team} onClose={() => setPlanning(null)} />}
      {editing && <EditShiftModal shift={editing} team={team} onClose={() => setEditing(null)} />}
      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
    </div>
  );
}

function ShiftChip({ shift, today, onClick }: { shift: Shift; today: string; onClick?: () => void }) {
  const past = shift.date < today;
  const absent = past && !shift.attendance;
  const late = (shift.attendance?.lateByMinutes ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'w-full rounded-lg border px-2 py-1 text-left text-[11px] leading-tight',
        absent
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : shift.attendance
            ? 'border-brand-200 bg-brand-50 text-brand-900'
            : 'border-sky-200 bg-sky-50 text-sky-900',
        onClick && 'hover:shadow-card',
      )}
    >
      <span className="block font-bold">
        {formatTime(shift.startAt)}–{formatTime(shift.endAt)}
      </span>
      {shift.label && <span className="block truncate opacity-80">{shift.label}</span>}
      {shift.attendance ? (
        <span className={cn('block', late && 'font-semibold text-amber-700')}>
          In {formatTime(shift.attendance.clockInAt)}
          {late ? ` (+${shift.attendance.lateByMinutes}m)` : ''}
          {shift.attendance.clockOutAt ? ` · out ${formatTime(shift.attendance.clockOutAt)}` : ''}
        </span>
      ) : (
        absent && <span className="block font-semibold">Absent</span>
      )}
    </button>
  );
}

function PlanModal({
  initial,
  days,
  team,
  onClose,
}: {
  initial: { employeeIds: string[]; dates: string[] };
  days: string[];
  team: Employee[];
  onClose: () => void;
}) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ['shift-templates', ops.storeId],
    queryFn: () => ops.get<ShiftTemplate[]>('/shift-templates'),
  });
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial.employeeIds);
  const [dates, setDates] = useState<string[]>(initial.dates);
  const [form, setForm] = useState({ startTime: '09:00', endTime: '17:00', breakMinutes: '30', label: '', notes: '' });
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const create = useMutation({
    mutationFn: () =>
      ops.post<Shift[]>('/shifts', {
        employeeIds,
        dates,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: Number(form.breakMinutes) || 0,
        label: form.label || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: (created) => {
      const requested = employeeIds.length * dates.length;
      toast.success(
        `${created.length} shifts scheduled`,
        created.length < requested
          ? `${requested - created.length} skipped because they overlap existing shifts.`
          : 'The team has been notified.',
      );
      void queryClient.invalidateQueries({ queryKey: ['shifts', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not schedule', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Plan shifts"
      footer={
        <Button loading={create.isPending} disabled={employeeIds.length === 0 || dates.length === 0} onClick={() => create.mutate()}>
          Schedule {employeeIds.length * dates.length || ''} shifts
        </Button>
      }
    >
      <div className="space-y-5">
        {templates.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-700">Template</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {templates.map((t) => (
                <Chip
                  key={t.id}
                  active={form.startTime === t.startTime && form.endTime === t.endTime}
                  onClick={() =>
                    setForm({ ...form, startTime: t.startTime, endTime: t.endTime, breakMinutes: String(t.breakMinutes), label: t.name })
                  }
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} /> {t.name} · {t.startTime}–{t.endTime}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Start">
            <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </Field>
          <Field label="End" hint="Earlier than start = overnight">
            <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </Field>
          <Field label="Break (min)">
            <Input type="number" min={0} value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
          </Field>
          <Field label="Label">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Morning" />
          </Field>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d, i) => (
              <Chip key={d} active={dates.includes(d)} onClick={() => setDates(toggle(dates, d))}>
                {WEEKDAY_SHORT[(i + 1) % 7]} {Number(d.slice(8))}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Team members ({employeeIds.length})</p>
            <button
              type="button"
              className="text-xs font-semibold text-brand-700"
              onClick={() => setEmployeeIds(employeeIds.length === team.length ? [] : team.map((e) => e.id))}
            >
              {employeeIds.length === team.length ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="mt-2 grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {team.map((e) => (
              <label
                key={e.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                  employeeIds.includes(e.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-200',
                )}
              >
                <input
                  type="checkbox"
                  checked={employeeIds.includes(e.id)}
                  onChange={() => setEmployeeIds(toggle(employeeIds, e.id))}
                  className="accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="text-xs text-slate-400">{e.department.toLowerCase().replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Notes for the team (optional)">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function EditShiftModal({ shift, team, onClose }: { shift: Shift; team: Employee[]; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employeeId: shift.employee.id,
    startTime: timeOfDay(shift.startAt),
    endTime: timeOfDay(shift.endAt),
    breakMinutes: String(shift.breakMinutes),
    label: shift.label ?? '',
    notes: shift.notes ?? '',
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['shifts', ops.storeId] });
  const save = useMutation({
    mutationFn: () =>
      ops.patch<Shift>(`/shifts/${shift.id}`, {
        employeeId: form.employeeId !== shift.employee.id ? form.employeeId : undefined,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: Number(form.breakMinutes) || 0,
        label: form.label || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success('Shift updated');
      refresh();
      onClose();
    },
    onError: (error) => toast.error('Could not update', errorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: () => ops.del(`/shifts/${shift.id}`),
    onSuccess: () => {
      toast.success('Shift cancelled');
      refresh();
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${shift.employee.name} · ${formatDate(shift.date, { weekday: 'short' })}`}
      description={shift.attendance ? `Clocked in at ${formatTime(shift.attendance.clockInAt)}` : undefined}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-rose-600"
            icon={<Trash2 className="size-4" />}
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel shift
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Team member" className="col-span-2">
          <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            {team.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start">
          <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        </Field>
        <Field label="End">
          <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        </Field>
        <Field label="Break (min)">
          <Input type="number" min={0} value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
        </Field>
        <Field label="Label">
          <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="Notes" className="col-span-2">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function TemplatesModal({ onClose }: { onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ['shift-templates', ops.storeId],
    queryFn: () => ops.get<ShiftTemplate[]>('/shift-templates'),
  });
  const [form, setForm] = useState({ name: '', startTime: '07:00', endTime: '15:00', breakMinutes: '30', color: '#0ea5e9' });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['shift-templates', ops.storeId] });
  const add = useMutation({
    mutationFn: () => ops.post('/shift-templates', { ...form, breakMinutes: Number(form.breakMinutes) || 0 }),
    onSuccess: () => {
      refresh();
      setForm({ ...form, name: '' });
    },
    onError: (error) => toast.error('Could not add the template', errorMessage(error)),
  });
  const remove = useMutation({ mutationFn: (id: string) => ops.del(`/shift-templates/${id}`), onSuccess: refresh });
  return (
    <Modal open onClose={onClose} title="Shift templates" description="Reusable shift timings for quick planning.">
      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="flex-1 text-sm font-semibold text-slate-900">{t.name}</span>
            <Badge tone="gray">
              {t.startTime}–{t.endTime} · {t.breakMinutes}m break
            </Badge>
            <IconButton label="Delete template" onClick={() => remove.mutate(t.id)} className="text-slate-400 hover:text-rose-600">
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-5">
        <Field label="Name" className="col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Evening" />
        </Field>
        <Field label="Start">
          <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        </Field>
        <Field label="End">
          <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        </Field>
        <Field label="Colour">
          <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="p-1" />
        </Field>
        <Button
          className="col-span-2 sm:col-span-5"
          variant="dark"
          disabled={form.name.trim().length < 2}
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          Add template
        </Button>
      </div>
    </Modal>
  );
}
