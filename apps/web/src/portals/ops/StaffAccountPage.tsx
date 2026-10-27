import { DEPARTMENT_LABELS, STAFF_ROLE_LABELS, formatPhone, type AuthSession, type Employee } from '@smartcart/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input } from '@/components/ui';
import { ApiError, errorMessage, logout, staffApi } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { useOpsStore } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { PageHeader } from './components';
import { useOps } from './hooks';

export default function StaffAccountPage() {
  const session = useSession('STAFF')!;
  const ops = useOps();
  const navigate = useNavigate();
  const setStore = useOpsStore((s) => s.setStore);
  const { data: me } = useQuery({
    queryKey: ['ops-employee', ops.membership.employeeId],
    queryFn: () => ops.get<Employee>(`/employees/${ops.membership.employeeId}`),
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My account" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={session.user.name} size="lg" />
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900">{session.user.name}</p>
              <p className="truncate text-sm text-slate-500">
                {session.user.username} · {session.user.email}
              </p>
            </div>
          </div>
          {me && (
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Employee code</dt>
                <dd className="font-mono font-semibold">{me.employeeCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Joined</dt>
                <dd>{formatDate(me.joiningDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Department</dt>
                <dd>{DEPARTMENT_LABELS[me.department]}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd>{formatPhone(me.phone)}</dd>
              </div>
              {me.reportsTo && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Reports to</dt>
                  <dd>{me.reportsTo.name}</dd>
                </div>
              )}
            </dl>
          )}
          <Button
            variant="outline"
            className="mt-5"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await logout('STAFF');
              navigate('/ops/login');
            }}
          >
            Log out
          </Button>
        </Card>

        <Card>
          <CardHeader title="My stores" />
          <ul className="divide-y divide-slate-100">
            {session.memberships.map((m) => (
              <li key={m.storeId} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{m.storeName}</p>
                  <p className="text-xs text-slate-500">
                    {STAFF_ROLE_LABELS[m.role]} · {m.designation ?? DEPARTMENT_LABELS[m.department]}
                  </p>
                </div>
                {m.storeId === ops.storeId ? (
                  <Badge tone="green">Current</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStore(m.storeId)}>
                    Switch
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <ChangePasswordCard />
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: () => staffApi.post<AuthSession>('/auth/change-password', { currentPassword: form.current, newPassword: form.next }),
    onSuccess: (session) => {
      useAuth.getState().setSession('STAFF', session);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed', 'You were signed out on your other devices.');
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors({ ...error.fieldErrors, form: error.message });
      toast.error('Could not change the password', errorMessage(error));
    },
  });
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Change password" />
      <form
        className="grid gap-4 p-5 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.next !== form.confirm) return setErrors({ confirm: 'The passwords do not match' });
          setErrors({});
          change.mutate();
        }}
      >
        <Field label="Current password" error={errors.currentPassword ?? errors.form}>
          <Input
            type="password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" error={errors.newPassword} hint="8+ characters with a letter and a number">
          <Input
            type="password"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm" error={errors.confirm}>
          <Input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            autoComplete="new-password"
          />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" icon={<KeyRound className="size-4" />} loading={change.isPending} disabled={!form.current || !form.next}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
