import {
  CREDENTIAL_REQUEST_ACTION_LABELS,
  DEPARTMENT_LABELS,
  STAFF_ROLE_LABELS,
  WAGE_TYPE_LABELS,
  formatMoney,
  formatPhone,
  type CredentialRequest,
} from '@smartcart/shared';
import { CheckCircle2, CircleDot, MessageSquareWarning, XCircle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

/** The new employee's details as submitted on a login (credential) request. */
export function CandidateCard({ request, showWage = true }: { request: CredentialRequest; showWage?: boolean }) {
  const c = request.candidate;
  const rows: [string, string | null][] = [
    ['Full name', c.fullName],
    ['Role', STAFF_ROLE_LABELS[c.role]],
    ['Department', DEPARTMENT_LABELS[c.department]],
    ['Designation', c.designation],
    ['Email', c.email],
    ['Phone', formatPhone(c.phone)],
    ['Joining date', formatDate(c.joiningDate)],
    ...(showWage ? ([['Wage', `${formatMoney(c.wageAmount)} ${WAGE_TYPE_LABELS[c.wageType]}`]] as [string, string][]) : []),
    ['Date of birth', c.dateOfBirth ? formatDate(c.dateOfBirth) : null],
    ['Address', c.address],
    ['Emergency contact', c.emergencyContactName ? `${c.emergencyContactName} · ${formatPhone(c.emergencyContactPhone)}` : null],
    ['ID proof', c.idProofType ? `${c.idProofType.replace('_', ' ')} ending ${c.idProofLast4 ?? '—'}` : null],
    ['Notes', c.notes],
  ];
  return (
    <Card>
      <CardHeader
        title="Employee details"
        subtitle={`Revision ${request.revision} · requested by ${request.requestedBy.name} (${STAFF_ROLE_LABELS[request.requestedBy.role]})`}
      />
      <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className={cn(label === 'Address' || label === 'Notes' ? 'sm:col-span-2' : undefined)}>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
              <dd className="mt-0.5 text-slate-900">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}

/** Manager → owner → SmartCart admin review history. */
export function RequestTimeline({ request }: { request: CredentialRequest }) {
  return (
    <Card>
      <CardHeader title="Review trail" />
      <ol className="space-y-4 p-5">
        {request.events.map((event) => {
          const negative = event.action === 'REJECTED' || event.action === 'CANCELLED';
          const changes = event.action === 'OWNER_REQUESTED_CHANGES' || event.action === 'ADMIN_REQUESTED_CHANGES';
          const positive = event.action === 'OWNER_APPROVED' || event.action === 'ADMIN_APPROVED';
          return (
            <li key={event.id} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5',
                  negative ? 'text-rose-600' : changes ? 'text-orange-600' : positive ? 'text-brand-600' : 'text-slate-400',
                )}
              >
                {negative ? (
                  <XCircle className="size-5" />
                ) : changes ? (
                  <MessageSquareWarning className="size-5" />
                ) : positive ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <CircleDot className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{CREDENTIAL_REQUEST_ACTION_LABELS[event.action]}</p>
                <p className="text-xs text-slate-500">
                  {event.actorName} · {event.actorRole} · {formatDateTime(event.at)}
                </p>
                {event.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{event.comment}”</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
