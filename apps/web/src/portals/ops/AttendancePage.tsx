import {
  STAFF_ROLE_LABELS,
  SocketEvents,
  formatDuration,
  formatMoney,
  type AttendanceBoard,
  type AttendanceRecord,
  type AttendanceSummaryRow,
  type Employee,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Timer, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Select,
  Stat,
  Table,
  Tabs,
  Td,
  Th,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { addDays, cn, formatDate, formatTime, localDate, startOfWeek, timeOfDay, useNow, zonedIso } from '@/lib/utils';
import { ClockCard, PageHeader } from './components';
import { useEmployees, useLiveInvalidate, useOps } from './hooks';

type View = 'today' | 'summary' | 'records';
type Preset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const monday = startOfWeek(today);
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'this-week':
      return { from: monday, to: today };
    case 'last-week':
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'this-month':
      return { from: monthStart, to: today };
    case 'last-month': {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    default:
      return { from: addDays(today, -13), to: today };
  }
}

/** Who came in, when they arrived and left, hours worked and days present. */
export default function AttendancePage() {
  const ops = useOps();
  const today = localDate();
  const [view, setView] = useState<View>(ops.isSupervisor ? 'today' : 'records');
  const [preset, setPreset] = useState<Preset>('this-week');
  const [custom, setCustom] = useState(presetRange('custom', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  useLiveInvalidate(
    [SocketEvents.ATTENDANCE_CHANGED],
    [
      ['attendance-board', ops.storeId],
      ['attendance', ops.storeId],
      ['my-attendance', ops.storeId],
    ],
    800,
  );

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Clock-ins from the app (geofenced) and the kiosk QR at the staff entrance." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Tabs
            className="mb-4"
            value={view}
            onChange={setView}
            tabs={[
              ...(ops.isSupervisor
                ? [
                    { value: 'today' as const, label: 'Today' },
                    { value: 'summary' as const, label: 'Hours & days present' },
                  ]
                : []),
              { value: 'records', label: ops.isSupervisor ? 'Clock-in log' : 'My clock-ins' },
            ]}
          />
          {view !== 'today' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-44" aria-label="Period">
                <option value="this-week">This week</option>
                <option value="last-week">Last week</option>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="custom">Custom range</option>
              </Select>
              {preset === 'custom' ? (
                <>
                  <Input
                    type="date"
                    value={custom.from}
                    max={custom.to}
                    onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                    className="w-40"
                  />
                  <span className="text-slate-400">to</span>
                  <Input
                    type="date"
                    value={custom.to}
                    min={custom.from}
                    max={today}
                    onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                    className="w-40"
                  />
                </>
              ) : (
                <span className="text-sm text-slate-500">
                  {formatDate(range.from)} – {formatDate(range.to)}
                </span>
              )}
            </div>
          )}
          {view === 'today' && <TodayBoard />}
          {view === 'summary' && <Summary from={range.from} to={range.to} />}
          {view === 'records' && <Records from={range.from} to={range.to} />}
        </div>
        <div className="space-y-4">
          <ClockCard />
          {ops.isLeadership && (
            <Card className="p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Attendance kiosk</p>
              <p className="mt-1">
                Open the kiosk on a tablet at the staff entrance. Its QR changes every minute, so a photo of it cannot be used to clock in
                from home.
              </p>
              <a href="/ops/kiosk" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="mt-3">
                  Open kiosk screen
                </Button>
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TodayBoard() {
  const ops = useOps();
  const now = useNow(60_000);
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-board', ops.storeId],
    queryFn: () => ops.get<AttendanceBoard>('/attendance/board'),
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <PageLoader />;
  const late = data.onDuty.filter((r) => r.lateByMinutes > 0).length + data.completed.filter((r) => r.lateByMinutes > 0).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="On duty now" value={data.onDuty.length} icon={<UserCheck className="size-4" />} tone="success" />
        <Stat label="Finished" value={data.completed.length} icon={<Clock className="size-4" />} />
        <Stat
          label="Not in yet"
          value={data.notYetIn.length}
          icon={<UserX className="size-4" />}
          tone={data.notYetIn.length > 0 ? 'warning' : 'default'}
        />
        <Stat label="Late today" value={late} icon={<Timer className="size-4" />} tone={late > 0 ? 'danger' : 'default'} />
      </div>
      <Card>
        <CardHeader title="On duty" />
        {data.onDuty.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Nobody is clocked in.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.onDuty.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={r.employee.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{r.employee.name}</p>
                  <p className="text-xs text-slate-500">
                    {STAFF_ROLE_LABELS[r.employee.role]} · in at {formatTime(r.clockInAt)} via {r.clockInMethod.toLowerCase()}
                    {r.shiftEndAt && ` · shift ends ${formatTime(r.shiftEndAt)}`}
                  </p>
                </div>
                {r.lateByMinutes > 0 && <Badge tone="orange">{r.lateByMinutes} min late</Badge>}
                <Badge tone="green">{formatDuration((now.getTime() - new Date(r.clockInAt).getTime()) / 60_000)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data.notYetIn.length > 0 && (
        <Card>
          <CardHeader title="Scheduled but not clocked in" />
          <ul className="divide-y divide-slate-100">
            {data.notYetIn.map((s) => {
              const overdue = new Date(s.startAt).getTime() < now.getTime();
              return (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.employee.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.employee.name}</p>
                    <p className="text-xs text-slate-500">
                      Shift {formatTime(s.startAt)}–{formatTime(s.endAt)}
                    </p>
                  </div>
                  <Badge tone={overdue ? 'red' : 'gray'}>
                    {overdue
                      ? `Late by ${formatDuration((now.getTime() - new Date(s.startAt).getTime()) / 60_000)}`
                      : `Starts ${formatTime(s.startAt)}`}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {data.completed.length > 0 && (
        <Card>
          <CardHeader title="Finished for the day" />
          <ul className="divide-y divide-slate-100">
            {data.completed.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Avatar name={r.employee.name} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.employee.name}</span>
                <span className="text-slate-500">
                  {formatTime(r.clockInAt)} – {formatTime(r.clockOutAt)}
                </span>
                <Badge tone="gray">{formatDuration(r.workedMinutes)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Summary({ from, to }: { from: string; to: string }) {
  const ops = useOps();
  const { data = [], isLoading } = useQuery({
    queryKey: ['attendance', ops.storeId, 'summary', from, to],
    queryFn: () => ops.get<AttendanceSummaryRow[]>('/attendance/summary', { query: { from, to } }),
  });
  if (isLoading) return <PageLoader />;
  if (data.length === 0) return <EmptyState icon="🗓️" title="No attendance in this period" />;
  const totalMinutes = data.reduce((sum, r) => sum + r.minutesWorked, 0);
  const totalPay = data.reduce((sum, r) => sum + (r.estimatedPay ?? 0), 0);
  return (
    <Card>
      <CardHeader
        title="Hours worked and days present"
        subtitle={`${formatDuration(totalMinutes)} worked in total${ops.isLeadership ? ` · estimated wages ${formatMoney(totalPay)}` : ''}`}
      />
      <Table>
        <thead>
          <tr>
            <Th>Employee</Th>
            <Th className="text-right">Days present</Th>
            <Th className="text-right">Absent</Th>
            <Th className="text-right">Late</Th>
            <Th className="text-right">Hours worked</Th>
            <Th className="text-right">Overtime</Th>
            <Th>Usual in / out</Th>
            {ops.isLeadership && <Th className="text-right">Est. pay</Th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.employee.id}>
              <Td>
                <p className="font-medium text-slate-900">{row.employee.name}</p>
                <p className="text-xs text-slate-500">
                  {STAFF_ROLE_LABELS[row.employee.role]} · {row.employee.employeeCode}
                </p>
              </Td>
              <Td className="tabular text-right">
                <span className="font-semibold">{row.daysPresent}</span>
                <span className="text-slate-400">/{row.daysScheduled}</span>
              </Td>
              <Td className={cn('tabular text-right', row.absences > 0 && 'font-semibold text-rose-600')}>{row.absences}</Td>
              <Td className={cn('tabular text-right', row.lateDays > 0 && 'text-amber-700')}>{row.lateDays}</Td>
              <Td className="tabular text-right">
                <span className="font-semibold">{formatDuration(row.minutesWorked)}</span>
                <span className="block text-xs text-slate-400">of {formatDuration(row.scheduledMinutes)}</span>
              </Td>
              <Td className="tabular text-right">{row.overtimeMinutes > 0 ? formatDuration(row.overtimeMinutes) : '—'}</Td>
              <Td className="text-xs text-slate-600">{row.avgClockIn ? `${row.avgClockIn} – ${row.avgClockOut ?? '…'}` : '—'}</Td>
              {ops.isLeadership && (
                <Td className="tabular text-right">{row.estimatedPay !== null ? formatMoney(row.estimatedPay) : '—'}</Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Records({ from, to }: { from: string; to: string }) {
  const ops = useOps();
  const [employeeId, setEmployeeId] = useState('');
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null);
  const { data: employees = [] } = useEmployees(ops.storeId);
  const { data = [], isLoading } = useQuery({
    queryKey: ['attendance', ops.storeId, 'records', from, to, employeeId],
    queryFn: () => ops.get<AttendanceRecord[]>('/attendance', { query: { from, to, employeeId: employeeId || undefined } }),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        {ops.isSupervisor ? (
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-56" aria-label="Employee">
            <option value="">Everyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="font-semibold text-slate-900">My clock-ins</p>
        )}
        {ops.isLeadership && (
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add manual entry
          </Button>
        )}
      </div>
      {isLoading ? (
        <PageLoader />
      ) : data.length === 0 ? (
        <EmptyState icon="⏱️" title="No clock-ins in this period" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Employee</Th>
              <Th>Shift</Th>
              <Th>Came in</Th>
              <Th>Left</Th>
              <Th className="text-right">Worked</Th>
              <Th>Notes</Th>
              {ops.isLeadership && <Th />}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(r.clockInAt, { weekday: 'short', year: undefined })}</Td>
                <Td>
                  <p className="font-medium text-slate-900">{r.employee.name}</p>
                  <p className="text-xs text-slate-500">{STAFF_ROLE_LABELS[r.employee.role]}</p>
                </Td>
                <Td className="text-xs whitespace-nowrap text-slate-500">
                  {r.shiftStartAt ? `${formatTime(r.shiftStartAt)}–${formatTime(r.shiftEndAt)}` : 'Unscheduled'}
                </Td>
                <Td className="whitespace-nowrap">
                  {formatTime(r.clockInAt)}
                  {r.lateByMinutes > 0 && (
                    <Badge tone="orange" className="ml-1.5">
                      +{r.lateByMinutes}m
                    </Badge>
                  )}
                  <span className="block text-[11px] text-slate-400">{r.clockInMethod.toLowerCase()}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {r.clockOutAt ? formatTime(r.clockOutAt) : <Badge tone="green">On duty</Badge>}
                  {r.leftEarlyByMinutes > 0 && (
                    <Badge tone="yellow" className="ml-1.5">
                      −{r.leftEarlyByMinutes}m
                    </Badge>
                  )}
                </Td>
                <Td className="tabular text-right font-semibold">{formatDuration(r.workedMinutes)}</Td>
                <Td className="max-w-48 text-xs text-slate-500">
                  {r.notes}
                  {r.editedByName && <span className="block text-amber-700">Edited by {r.editedByName}</span>}
                </Td>
                {ops.isLeadership && (
                  <Td>
                    <IconButton label="Correct entry" onClick={() => setEditing(r)}>
                      <Pencil className="size-4" />
                    </IconButton>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <AttendanceModal record={editing === 'new' ? null : editing} employees={employees} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function AttendanceModal({ record, employees, onClose }: { record: AttendanceRecord | null; employees: Employee[]; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const day = record ? new Date(record.clockInAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : localDate();
  const [form, setForm] = useState({
    employeeId: record?.employee.id ?? '',
    date: day,
    inTime: record ? timeOfDay(record.clockInAt) : '09:00',
    outTime: record?.clockOutAt ? timeOfDay(record.clockOutAt) : '',
    note: '',
  });
  const save = useMutation({
    mutationFn: () => {
      const clockInAt = zonedIso(form.date, form.inTime);
      let clockOutAt: string | null = form.outTime ? zonedIso(form.date, form.outTime) : null;
      if (clockOutAt && clockOutAt <= clockInAt) clockOutAt = zonedIso(addDays(form.date, 1), form.outTime);
      return record
        ? ops.patch(`/attendance/${record.id}`, { clockInAt, clockOutAt, note: form.note })
        : ops.post('/attendance', { employeeId: form.employeeId, clockInAt, clockOutAt: clockOutAt ?? undefined, note: form.note });
    },
    onSuccess: () => {
      toast.success(record ? 'Attendance corrected' : 'Attendance added');
      void queryClient.invalidateQueries({ queryKey: ['attendance', ops.storeId] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-board', ops.storeId] });
      onClose();
    },
    onError: (error) => toast.error('Could not save', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={record ? `Correct ${record.employee.name}'s attendance` : 'Manual attendance entry'}
      description="Corrections are logged with your name and the reason."
      footer={
        <Button
          loading={save.isPending}
          disabled={form.note.trim().length < 3 || (!record && !form.employeeId)}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {!record && (
          <Field label="Employee" className="col-span-2">
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Choose…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date" className="col-span-2">
          <Input
            type="date"
            value={form.date}
            max={localDate()}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            disabled={Boolean(record)}
          />
        </Field>
        <Field label="Clock in">
          <Input type="time" value={form.inTime} onChange={(e) => setForm({ ...form, inTime: e.target.value })} />
        </Field>
        <Field label="Clock out">
          <Input type="time" value={form.outTime} onChange={(e) => setForm({ ...form, outTime: e.target.value })} />
        </Field>
        <Field label="Reason" className="col-span-2">
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Forgot to clock out" />
        </Field>
      </div>
    </Modal>
  );
}
