import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  SocketEvents,
  WAGE_TYPES,
  WAGE_TYPE_LABELS,
  formatMoney,
  formatPhone,
  timeAgo,
  type CredentialRequest,
  type Department,
  type Employee,
  type StaffRole,
  type Ticket,
  type WageType,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageLoader,
  Segmented,
  Select,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { formatDate, paiseToRupees, rupeesToPaise, useDebounced } from '@/lib/utils';
import { PageHeader, RequestStatusBadge } from './components';
import { useLiveInvalidate, useOps } from './hooks';

type View = 'people' | 'requests';
type StatusFilter = 'current' | 'former';

/** The store's employees, and the login requests raised for new joiners. */
export default function TeamPage() {
  const ops = useOps();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('people');
  return (
    <div>
      <PageHeader
        title="Team & logins"
        subtitle="New joiners get their SmartCart login after the store owner and the SmartCart team approve the request."
        actions={
          ops.isLeadership && (
            <Button icon={<UserPlus className="size-4" />} onClick={() => navigate('/ops/team/requests/new')}>
              Request a login
            </Button>
          )
        }
      />
      {ops.isLeadership && (
        <Tabs
          className="mb-5"
          value={view}
          onChange={setView}
          tabs={[
            { value: 'people', label: 'Employees' },
            { value: 'requests', label: 'Login requests' },
          ]}
        />
      )}
      {view === 'people' ? <People /> : <Requests />}
    </div>
  );
}

function People() {
  const ops = useOps();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<StaffRole | ''>('');
  const [status, setStatus] = useState<StatusFilter>('current');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [offboarding, setOffboarding] = useState<Employee | null>(null);
  const search = useDebounced(q, 250);
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['ops-employees', ops.storeId, 'list', search, role, status],
    queryFn: () =>
      ops.get<Employee[]>('/employees', {
        query: {
          q: search || undefined,
          role: role || undefined,
          status: status === 'current' ? 'ACTIVE,ON_LEAVE' : 'LEFT,TERMINATED',
          limit: 200,
        },
      }),
  });
  const wages = employees.some((e) => e.wageAmount !== null);
  const monthly = employees.reduce(
    (sum, e) =>
      sum +
      (e.wageType === 'MONTHLY'
        ? (e.wageAmount ?? 0)
        : e.wageType === 'DAILY'
          ? (e.wageAmount ?? 0) * 26
          : e.wageType === 'HOURLY'
            ? (e.wageAmount ?? 0) * 208
            : 0),
    0,
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
          <Input className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, phone or email" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole | '')} className="w-44" aria-label="Role">
          <option value="">All roles</option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'current', label: 'Current' },
            { value: 'former', label: 'Former' },
          ]}
        />
        {wages && status === 'current' && <Badge tone="gray">≈ {formatMoney(monthly)} / month in wages</Badge>}
      </div>
      {isLoading ? (
        <PageLoader />
      ) : employees.length === 0 ? (
        <EmptyState icon="👥" title="No employees match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Phone</Th>
              <Th>Joined</Th>
              {wages && <Th className="text-right">Wage</Th>}
              <Th>Status</Th>
              <Th>Last login</Th>
              {ops.isLeadership && <Th />}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.employeeCode}
                        {e.username && ` · ${e.username}`}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <p className="text-slate-900">{STAFF_ROLE_LABELS[e.role]}</p>
                  <p className="text-xs text-slate-500">{e.designation ?? DEPARTMENT_LABELS[e.department]}</p>
                </Td>
                <Td className="whitespace-nowrap">{e.phone ? <a href={`tel:${e.phone}`}>{formatPhone(e.phone)}</a> : '—'}</Td>
                <Td className="whitespace-nowrap">{formatDate(e.joiningDate)}</Td>
                {wages && (
                  <Td className="tabular text-right whitespace-nowrap">
                    {e.wageAmount !== null && e.wageType ? (
                      <>
                        {formatMoney(e.wageAmount)}
                        <span className="block text-xs text-slate-400">{WAGE_TYPE_LABELS[e.wageType]}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                )}
                <Td>
                  <Badge tone={e.status === 'ACTIVE' ? 'green' : e.status === 'ON_LEAVE' ? 'yellow' : 'gray'}>
                    {EMPLOYEE_STATUS_LABELS[e.status]}
                  </Badge>
                  {e.exitDate && <span className="block text-xs text-slate-400">left {formatDate(e.exitDate)}</span>}
                </Td>
                <Td className="text-xs text-slate-500">{e.lastLoginAt ? timeAgo(e.lastLoginAt) : 'Never'}</Td>
                {ops.isLeadership && (
                  <Td className="whitespace-nowrap">
                    {e.role !== 'OWNER' && (e.status === 'ACTIVE' || e.status === 'ON_LEAVE') && (
                      <>
                        <IconButton label="Edit" onClick={() => setEditing(e)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        {e.id !== ops.membership.employeeId && (
                          <IconButton label="Request offboarding" onClick={() => setOffboarding(e)} className="hover:text-rose-600">
                            <UserMinus className="size-4" />
                          </IconButton>
                        )}
                      </>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <EditEmployeeModal employee={editing} onClose={() => setEditing(null)} />}
      {offboarding && <OffboardModal employee={offboarding} onClose={() => setOffboarding(null)} />}
    </Card>
  );
}

function EditEmployeeModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const self = employee.id === ops.membership.employeeId;
  const [form, setForm] = useState({
    designation: employee.designation ?? '',
    department: employee.department,
    phone: employee.phone ?? '',
    wageType: employee.wageType ?? ('MONTHLY' as WageType),
    wageAmount: employee.wageAmount !== null ? paiseToRupees(employee.wageAmount) : '',
    status: employee.status === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canEditWage = ops.isOwner || !self;
  const save = useMutation({
    mutationFn: () =>
      ops.patch<Employee>(`/employees/${employee.id}`, {
        designation: form.designation || null,
        department: form.department,
        phone: form.phone || undefined,
        status: form.status,
        ...(canEditWage && form.wageAmount !== '' ? { wageType: form.wageType, wageAmount: rupeesToPaise(form.wageAmount) } : {}),
      }),
    onSuccess: () => {
      toast.success('Employee updated');
      void queryClient.invalidateQueries({ queryKey: ['ops-employees', ops.storeId] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save', errorMessage(error));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={employee.name}
      description={`${STAFF_ROLE_LABELS[employee.role]} · ${employee.employeeCode}`}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Designation" className="col-span-2">
          <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Senior picker" />
        </Field>
        <Field label="Department">
          <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as Department })}>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Wage type" hint={canEditWage ? undefined : 'Ask the owner to change your own wage'}>
          <Select
            value={form.wageType}
            onChange={(e) => setForm({ ...form, wageType: e.target.value as WageType })}
            disabled={!canEditWage}
          >
            {WAGE_TYPES.map((w) => (
              <option key={w} value={w}>
                {WAGE_TYPE_LABELS[w]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Wage (₹)" error={errors.wageAmount}>
          <Input
            value={form.wageAmount}
            onChange={(e) => setForm({ ...form, wageAmount: e.target.value })}
            inputMode="decimal"
            disabled={!canEditWage}
          />
        </Field>
        <Field label="Status" className="col-span-2">
          <Segmented
            value={form.status}
            onChange={(status) => setForm({ ...form, status })}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'ON_LEAVE', label: 'On leave' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Account deletion is done by the SmartCart team: the store raises an offboarding request. */
function OffboardModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const ops = useOps();
  const navigate = useNavigate();
  const [reason, setReason] = useState<'LEFT' | 'TERMINATED'>('LEFT');
  const [lastDay, setLastDay] = useState(new Date().toISOString().slice(0, 10));
  const [details, setDetails] = useState('');
  const raise = useMutation({
    mutationFn: () =>
      ops.post<Ticket>('/tickets', {
        category: 'EMPLOYEE_OFFBOARDING',
        priority: reason === 'TERMINATED' ? 'HIGH' : 'MEDIUM',
        subject: `Remove access for ${employee.name} (${employee.employeeCode})`,
        description: `${employee.name} ${reason === 'LEFT' ? 'has resigned' : 'was terminated'}. Last working day: ${lastDay}.${details ? `\n\n${details}` : ''}`,
        relatedEmployeeId: employee.id,
      }),
    onSuccess: (ticket) => {
      toast.success('Offboarding request sent', `${ticket.ticketNumber}: the SmartCart team will deactivate the login.`);
      onClose();
      navigate('/ops/support');
    },
    onError: (error) => toast.error('Could not send the request', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Offboard ${employee.name}`}
      description="SmartCart admins deactivate the login and keep the employment record for your books."
      footer={
        <Button variant="danger" loading={raise.isPending} onClick={() => raise.mutate()}>
          Send to SmartCart
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={reason}
          onChange={setReason}
          options={[
            { value: 'LEFT', label: 'Resigned / left' },
            { value: 'TERMINATED', label: 'Terminated' },
          ]}
        />
        <Field label="Last working day">
          <Input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
        </Field>
        <Field label="Details (optional)">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Return of uniform, final settlement…" />
        </Field>
      </div>
    </Modal>
  );
}

function Requests() {
  const ops = useOps();
  const userId = useSession('STAFF')!.user.id;
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['ops-requests', ops.storeId],
    queryFn: () => ops.get<CredentialRequest[]>('/requests', { query: { limit: 100 } }),
  });
  useLiveInvalidate([SocketEvents.REQUEST_CHANGED], [['ops-requests', ops.storeId]], 500);
  if (isLoading) return <PageLoader />;
  if (requests.length === 0) {
    return <EmptyState icon="🪪" title="No login requests yet" body="When someone joins, request their SmartCart login here." />;
  }
  const waitingForMe = requests.filter(
    (r) =>
      (ops.isOwner && r.status === 'PENDING_OWNER') ||
      ((r.status === 'OWNER_CHANGES_REQUESTED' || r.status === 'ADMIN_CHANGES_REQUESTED') && (ops.isOwner || r.requestedBy.id === userId)),
  );
  return (
    <div className="space-y-4">
      {waitingForMe.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {waitingForMe.length} {waitingForMe.length === 1 ? 'request needs' : 'requests need'} your action
        </p>
      )}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Request</Th>
              <Th>New employee</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Requested by</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50">
                <Td>
                  <Link to={`/ops/team/requests/${r.id}`} className="font-mono text-sm font-semibold text-brand-700">
                    {r.requestNumber}
                  </Link>
                </Td>
                <Td>
                  <Link to={`/ops/team/requests/${r.id}`} className="block">
                    <p className="font-medium text-slate-900">{r.candidate.fullName}</p>
                    <p className="text-xs text-slate-500">Joins {formatDate(r.candidate.joiningDate)}</p>
                  </Link>
                </Td>
                <Td>{STAFF_ROLE_LABELS[r.candidate.role]}</Td>
                <Td>
                  <RequestStatusBadge status={r.status} />
                  {r.lastComment && (r.status === 'OWNER_CHANGES_REQUESTED' || r.status === 'ADMIN_CHANGES_REQUESTED') && (
                    <p className="mt-1 max-w-56 truncate text-xs text-orange-700">“{r.lastComment}”</p>
                  )}
                </Td>
                <Td className="text-sm">{r.requestedBy.name}</Td>
                <Td className="text-xs text-slate-500">{timeAgo(r.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
