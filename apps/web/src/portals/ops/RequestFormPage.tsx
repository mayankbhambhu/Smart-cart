import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  ID_PROOF_TYPES,
  REQUESTABLE_ROLES,
  STAFF_ROLE_LABELS,
  WAGE_TYPES,
  WAGE_TYPE_LABELS,
  type CandidateDetails,
  type CredentialRequest,
  type Department,
  type IdProofType,
  type RequestableRole,
  type WageType,
} from '@smartcart/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Card, CardHeader, Field, Input, PageLoader, Select, Textarea } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { localDate, paiseToRupees, rupeesToPaise } from '@/lib/utils';
import { PageHeader } from './components';
import { useEmployees, useOps } from './hooks';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  role: RequestableRole;
  department: Department;
  designation: string;
  joiningDate: string;
  wageType: WageType;
  wageAmount: string;
  dateOfBirth: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  idProofType: IdProofType | '';
  idProofLast4: string;
  notes: string;
  reportsToId: string;
}

const EMPTY: FormState = {
  fullName: '',
  email: '',
  phone: '',
  role: 'WORKER',
  department: 'FLOOR',
  designation: '',
  joiningDate: localDate(1),
  wageType: 'MONTHLY',
  wageAmount: '',
  dateOfBirth: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  idProofType: '',
  idProofLast4: '',
  notes: '',
  reportsToId: '',
};

function fromCandidate(c: CandidateDetails): FormState {
  return {
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    role: c.role,
    department: c.department,
    designation: c.designation ?? '',
    joiningDate: c.joiningDate,
    wageType: c.wageType,
    wageAmount: paiseToRupees(c.wageAmount),
    dateOfBirth: c.dateOfBirth ?? '',
    address: c.address ?? '',
    emergencyContactName: c.emergencyContactName ?? '',
    emergencyContactPhone: c.emergencyContactPhone ?? '',
    idProofType: c.idProofType ?? '',
    idProofLast4: c.idProofLast4 ?? '',
    notes: c.notes ?? '',
    reportsToId: c.reportsToId ?? '',
  };
}

/** Store manager raises a login request for a new joiner (or fixes one that was sent back). */
export default function RequestFormPage() {
  const ops = useOps();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const { data: existing, isLoading } = useQuery({
    queryKey: ['ops-request', editId],
    queryFn: () => ops.get<CredentialRequest>(`/requests/${editId}`),
    enabled: Boolean(editId),
  });
  const { data: employees = [] } = useEmployees(ops.storeId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (existing) setForm(fromCandidate(existing.candidate));
  }, [existing]);

  const sentBack = existing?.status === 'OWNER_CHANGES_REQUESTED' || existing?.status === 'ADMIN_CHANGES_REQUESTED';
  const set =
    <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value as FormState[K] });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        department: form.department,
        designation: form.designation || null,
        joiningDate: form.joiningDate,
        wageType: form.wageType,
        wageAmount: rupeesToPaise(form.wageAmount || '0'),
        dateOfBirth: form.dateOfBirth || null,
        address: form.address || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        idProofType: form.idProofType || null,
        idProofLast4: form.idProofLast4 || null,
        notes: form.notes || null,
        reportsToId: form.reportsToId || null,
      };
      if (!existing) return ops.post<CredentialRequest>('/requests', body);
      const updated = await ops.patch<CredentialRequest>(`/requests/${existing.id}`, body);
      return sentBack ? ops.post<CredentialRequest>(`/requests/${existing.id}/resubmit`, { comment: comment || undefined }) : updated;
    },
    onSuccess: (request) => {
      toast.success(
        existing ? (sentBack ? 'Request resubmitted' : 'Request updated') : 'Login request sent',
        request.status === 'PENDING_ADMIN' ? 'Waiting for the SmartCart team.' : 'Waiting for the store owner.',
      );
      navigate(`/ops/team/requests/${request.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not send the request', errorMessage(error));
    },
  });

  if (!ops.isLeadership) return <PageHeader title="Login requests" subtitle="Only the store manager or owner can request logins." />;
  if (editId && isLoading) return <PageLoader />;
  const roles = REQUESTABLE_ROLES.filter((r) => ops.isOwner || r !== 'STORE_MANAGER');
  const managers = employees.filter(
    (e) => e.status === 'ACTIVE' && (e.role === 'STORE_MANAGER' || e.role === 'FLOOR_MANAGER' || e.role === 'OWNER'),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/ops/team" className="text-sm font-semibold text-brand-700">
        ← Team
      </Link>
      <PageHeader
        title={existing ? `Edit ${existing.requestNumber}` : 'Request a login for a new employee'}
        subtitle={
          ops.isOwner
            ? 'As the owner, your request goes straight to the SmartCart team.'
            : 'The store owner reviews it first, then the SmartCart team issues the login.'
        }
      />
      {sentBack && existing?.lastComment && (
        <Card className="mb-5 border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-semibold">Changes requested</p>
          <p className="mt-1">“{existing.lastComment}”</p>
        </Card>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          save.mutate();
        }}
      >
        <Card>
          <CardHeader title="Job" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Role" error={errors.role}>
              <Select value={form.role} onChange={set('role')}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {STAFF_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department" error={errors.department}>
              <Select value={form.department} onChange={set('department')}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Designation" error={errors.designation}>
              <Input value={form.designation} onChange={set('designation')} placeholder="Picker" />
            </Field>
            <Field label="Joining date" error={errors.joiningDate}>
              <Input type="date" value={form.joiningDate} onChange={set('joiningDate')} />
            </Field>
            <Field label="Wage type" error={errors.wageType}>
              <Select value={form.wageType} onChange={set('wageType')}>
                {WAGE_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {WAGE_TYPE_LABELS[w]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wage (₹)" error={errors.wageAmount}>
              <Input value={form.wageAmount} onChange={set('wageAmount')} inputMode="decimal" placeholder="18000" />
            </Field>
            <Field label="Reports to" className="sm:col-span-3">
              <Select value={form.reportsToId} onChange={set('reportsToId')}>
                <option value="">Store manager (default)</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {STAFF_ROLE_LABELS[m.role]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Person" subtitle="The login details are sent to this email and phone." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" error={errors.fullName}>
              <Input value={form.fullName} onChange={set('fullName')} autoFocus={!existing} />
            </Field>
            <Field label="Date of birth" error={errors.dateOfBirth}>
              <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Mobile number" error={errors.phone}>
              <Input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Home address" error={errors.address} className="sm:col-span-2">
              <Input value={form.address} onChange={set('address')} />
            </Field>
            <Field label="Emergency contact name" error={errors.emergencyContactName}>
              <Input value={form.emergencyContactName} onChange={set('emergencyContactName')} />
            </Field>
            <Field label="Emergency contact phone" error={errors.emergencyContactPhone}>
              <Input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
            </Field>
            <Field label="ID proof" error={errors.idProofType}>
              <Select value={form.idProofType} onChange={set('idProofType')}>
                <option value="">Not provided</option>
                {ID_PROOF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Last 4 characters of the ID" error={errors.idProofLast4} hint="We never store the full ID number.">
              <Input value={form.idProofLast4} onChange={set('idProofLast4')} maxLength={4} className="uppercase" />
            </Field>
            <Field label="Notes for the reviewers" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={set('notes')} placeholder="Experience, references, anything the owner should know" />
            </Field>
          </div>
        </Card>

        {sentBack && (
          <Card className="p-5">
            <Field label="What did you change? (optional)">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Corrected the phone number" />
            </Field>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Link to="/ops/team">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" size="lg" icon={<Send className="size-4" />} loading={save.isPending}>
            {existing ? (sentBack ? 'Resubmit for review' : 'Save changes') : ops.isOwner ? 'Send to SmartCart' : 'Send to the owner'}
          </Button>
        </div>
      </form>
    </div>
  );
}
