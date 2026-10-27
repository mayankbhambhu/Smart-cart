import {
  EMPLOYEE_STATUS_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  WAGE_TYPE_LABELS,
  formatMoney,
  formatPhone,
  timeAgo,
  type AdminStoreRow,
  type Employee,
  type IssuedCredentials,
  type Paginated,
  type StaffRole,
} from '@smartcart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Search, UserX } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { adminApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { copyToClipboard, formatDate, localDate, useDebounced } from '@/lib/utils';
import { useAdminRole } from './hooks';

type StatusFilter = 'current' | 'former' | 'all';
const STATUSES: Record<StatusFilter, string | undefined> = { current: 'ACTIVE,ON_LEAVE', former: 'LEFT,TERMINATED', all: undefined };

/** Everyone working at SmartCart stores: name, number, joining date, wages; offboard leavers here. */
export default function EmployeesPage() {
  const { canManage } = useAdminRole();
  const [q, setQ] = useState('');
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState<StaffRole | ''>('');
  const [status, setStatus] = useState<StatusFilter>('current');
  const [limit, setLimit] = useState(100);
  const [offboarding, setOffboarding] = useState<Employee | null>(null);
  const [resetFor, setResetFor] = useState<Employee | null>(null);
  const search = useDebounced(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-employees', search, storeId, role, status, limit],
    queryFn: () =>
      adminApi.get<Paginated<Employee>>('/admin/employees', {
        query: {
          q: search || undefined,
          storeId: storeId || undefined,
          role: role || undefined,
          status: STATUSES[status],
          limit: Math.min(limit, 200),
        },
      }),
    placeholderData: keepPreviousData,
  });
  const { data: stores = [] } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.get<AdminStoreRow[]>('/admin/stores') });

  return (
    <div>
      <PageHeader title="Employees" subtitle={data ? `${data.total} people` : undefined} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-5 text-slate-400" />
            <Input
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, email, code or username"
            />
          </div>
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-52" aria-label="Store">
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole | '')} className="w-40" aria-label="Role">
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
              { value: 'former', label: 'Left / fired' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {isLoading ? (
          <PageLoader />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="👥" title="No employees match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Store</Th>
                <Th>Role</Th>
                <Th>Phone</Th>
                <Th>Joined</Th>
                <Th className="text-right">Wage</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => {
                const current = e.status === 'ACTIVE' || e.status === 'ON_LEAVE';
                return (
                  <tr key={e.id} className={current ? undefined : 'opacity-60'}>
                    <Td>
                      <p className="font-medium text-slate-900">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.employeeCode} · {e.username ?? 'no login'}
                      </p>
                    </Td>
                    <Td className="text-sm">{e.storeName}</Td>
                    <Td>
                      {STAFF_ROLE_LABELS[e.role]}
                      {e.designation && <span className="block text-xs text-slate-500">{e.designation}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{formatPhone(e.phone)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(e.joiningDate)}</Td>
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
                    <Td>
                      <Badge
                        tone={
                          e.status === 'ACTIVE' ? 'green' : e.status === 'ON_LEAVE' ? 'yellow' : e.status === 'TERMINATED' ? 'red' : 'gray'
                        }
                      >
                        {EMPLOYEE_STATUS_LABELS[e.status]}
                      </Badge>
                      {e.exitDate && <span className="block text-xs text-slate-400">on {formatDate(e.exitDate)}</span>}
                    </Td>
                    <Td className="text-xs text-slate-500">{e.lastLoginAt ? timeAgo(e.lastLoginAt) : 'Never'}</Td>
                    {canManage && (
                      <Td className="whitespace-nowrap">
                        {current && e.userId && (
                          <IconButton label="Reset password" onClick={() => setResetFor(e)}>
                            <KeyRound className="size-4" />
                          </IconButton>
                        )}
                        {current && e.role !== 'OWNER' && (
                          <IconButton label="Offboard / delete account" onClick={() => setOffboarding(e)} className="hover:text-rose-600">
                            <UserX className="size-4" />
                          </IconButton>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {data && data.total > data.items.length && limit < 200 && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(200)}>
              Show more
            </Button>
          </div>
        )}
      </Card>
      {offboarding && <OffboardModal employee={offboarding} onClose={() => setOffboarding(null)} />}
      {resetFor && <ResetPasswordModal employee={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function OffboardModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<'LEFT' | 'TERMINATED'>('LEFT');
  const [exitDate, setExitDate] = useState(localDate());
  const [note, setNote] = useState('');
  const offboard = useMutation({
    mutationFn: () => adminApi.post<Employee>(`/admin/employees/${employee.id}/offboard`, { reason, exitDate, note: note || undefined }),
    onSuccess: () => {
      toast.success(`${employee.name} offboarded`, 'Their login is deactivated and open tasks were cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      onClose();
    },
    onError: (error) => toast.error('Could not offboard', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Offboard ${employee.name}?`}
      description={`${STAFF_ROLE_LABELS[employee.role]} at ${employee.storeName}. Signs them out everywhere and deletes their login. Attendance and payroll history is kept.`}
      footer={
        <Button variant="danger" loading={offboard.isPending} onClick={() => offboard.mutate()}>
          Delete login
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={reason}
          onChange={setReason}
          options={[
            { value: 'LEFT', label: 'Left / resigned' },
            { value: 'TERMINATED', label: 'Fired / terminated' },
          ]}
        />
        <Field label="Last working day">
          <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        </Field>
        <Field label="Note (kept in the audit log)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ticket SR-1042, final settlement done" />
        </Field>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const reset = useMutation({
    mutationFn: () => adminApi.post<IssuedCredentials>(`/admin/employees/${employee.id}/reset-password`),
    onSuccess: setIssued,
    onError: (error) => toast.error('Could not reset', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${employee.name}`}
      description={
        issued
          ? 'Share this temporary password securely. They choose a new one at sign-in.'
          : 'Signs them out on every device and issues a temporary password.'
      }
      footer={
        !issued && (
          <Button variant="dark" loading={reset.isPending} onClick={() => reset.mutate()}>
            Reset password
          </Button>
        )
      }
    >
      {issued ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-900 p-4 font-mono text-sm text-white">
            <p>
              <span className="text-slate-400">Username</span> {issued.username}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Password</span> <span className="font-bold text-amber-300">{issued.temporaryPassword}</span>
            </p>
          </div>
          <Button
            block
            icon={<Copy className="size-4" />}
            onClick={() =>
              copyToClipboard(`${issued.loginUrl}\nUsername: ${issued.username}\nTemporary password: ${issued.temporaryPassword}`).then(
                () => toast.success('Copied'),
              )
            }
          >
            Copy
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Use this when someone forgot their password or a login may have been shared.</p>
      )}
    </Modal>
  );
}
