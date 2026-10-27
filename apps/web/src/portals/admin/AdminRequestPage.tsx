import { type CredentialRequest, type IssuedCredentials } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, KeyRound, MessageSquareWarning, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CandidateCard, RequestTimeline } from '@/components/requests';
import { RequestStatusBadge } from '@/components/status';
import { Button, Card, ErrorState, Field, Modal, PageHeader, PageLoader, Textarea } from '@/components/ui';
import { adminApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/lib/utils';
import { useAdminRole } from './hooks';

type Decision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export default function AdminRequestPage() {
  const { requestId } = useParams();
  const { canManage } = useAdminRole();
  const queryClient = useQueryClient();
  const key = ['admin-request', requestId];
  const {
    data: request,
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: key, queryFn: () => adminApi.get<CredentialRequest>(`/admin/requests/${requestId}`) });
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !request) return <ErrorState error={error} retry={() => void refetch()} />;
  const actionable = request.status === 'PENDING_ADMIN';

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/requests" className="text-sm font-semibold text-indigo-700">
        ← Login requests
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {request.candidate.fullName} <RequestStatusBadge status={request.status} />
          </span>
        }
        subtitle={`${request.requestNumber} · ${request.storeName} (${request.storeCode})`}
      />
      {actionable && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-indigo-200 bg-indigo-50 p-4">
          <p className="flex-1 text-sm text-indigo-900">
            Approved by the store owner.{' '}
            {canManage ? 'Check the details, then issue the login or send it back.' : 'An admin or super admin needs to make the decision.'}
          </p>
          {canManage && (
            <>
              <Button variant="outline" icon={<MessageSquareWarning className="size-4" />} onClick={() => setDeciding('REQUEST_CHANGES')}>
                Send back
              </Button>
              <Button variant="ghost" className="text-rose-600" icon={<XCircle className="size-4" />} onClick={() => setDeciding('REJECT')}>
                Reject
              </Button>
              <Button variant="dark" icon={<KeyRound className="size-4" />} onClick={() => setDeciding('APPROVE')}>
                Approve &amp; issue login
              </Button>
            </>
          )}
        </Card>
      )}
      {request.issued && (
        <Card className="mb-5 flex items-center gap-3 border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <CheckCircle2 className="size-5" />
          Login issued: <strong className="font-mono">{request.issued.username}</strong> ·{' '}
          <span className="font-mono">{request.issued.employeeCode}</span>
          <Link to="/admin/employees" className="ml-auto font-semibold text-brand-700">
            Employees →
          </Link>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <CandidateCard request={request} />
        <RequestTimeline request={request} />
      </div>
      {deciding && (
        <DecisionModal
          request={request}
          decision={deciding}
          onClose={() => setDeciding(null)}
          onDone={(updated, credentials) => {
            queryClient.setQueryData(key, updated);
            void queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
            void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
            if (credentials) setIssued(credentials);
          }}
        />
      )}
      {issued && <CredentialsModal credentials={issued} name={request.candidate.fullName} onClose={() => setIssued(null)} />}
    </div>
  );
}

function DecisionModal({
  request,
  decision,
  onClose,
  onDone,
}: {
  request: CredentialRequest;
  decision: Decision;
  onClose: () => void;
  onDone: (request: CredentialRequest, credentials: IssuedCredentials | null) => void;
}) {
  const [comment, setComment] = useState('');
  const review = useMutation({
    mutationFn: () =>
      adminApi.post<{ request: CredentialRequest; credentials: IssuedCredentials | null }>(`/admin/requests/${request.id}/review`, {
        decision,
        comment: comment || undefined,
      }),
    onSuccess: ({ request: updated, credentials }) => {
      toast.success(decision === 'APPROVE' ? 'Login issued' : decision === 'REJECT' ? 'Request rejected' : 'Sent back to the store');
      onDone(updated, credentials);
      onClose();
    },
    onError: (error) => toast.error('Could not save the decision', errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={
        decision === 'APPROVE'
          ? `Issue a login for ${request.candidate.fullName}?`
          : decision === 'REJECT'
            ? 'Reject this request'
            : 'Send back to the store'
      }
      description={
        decision === 'APPROVE'
          ? 'Creates the employee record and a staff account with a temporary password.'
          : 'The store manager and owner are notified with your comment.'
      }
      footer={
        <Button
          variant={decision === 'REJECT' ? 'danger' : 'dark'}
          loading={review.isPending}
          disabled={decision !== 'APPROVE' && comment.trim().length < 3}
          onClick={() => review.mutate()}
        >
          {decision === 'APPROVE' ? 'Approve and issue' : decision === 'REJECT' ? 'Reject' : 'Send back'}
        </Button>
      }
    >
      <Field label={decision === 'APPROVE' ? 'Comment (optional)' : 'What needs to change?'}>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          autoFocus
          placeholder={decision === 'APPROVE' ? 'Welcome aboard!' : 'The ID proof does not match the name.'}
        />
      </Field>
    </Modal>
  );
}

function CredentialsModal({ credentials, name, onClose }: { credentials: IssuedCredentials; name: string; onClose: () => void }) {
  const message = `Hi ${name.split(' ')[0]}, your SmartCart Store OS login is ready.\nSign in at ${credentials.loginUrl}\nUsername: ${credentials.username}\nEmployee code: ${credentials.employeeCode}\nTemporary password: ${credentials.temporaryPassword}\nYou will be asked to choose your own password.`;
  return (
    <Modal
      open
      onClose={onClose}
      title="Login issued"
      description="Share these details with the employee securely. The temporary password is not shown again."
    >
      <dl className="space-y-2 rounded-2xl bg-slate-900 p-4 font-mono text-sm text-white">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Username</dt>
          <dd>{credentials.username}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Employee code</dt>
          <dd>{credentials.employeeCode}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Temporary password</dt>
          <dd className="font-bold text-amber-300">{credentials.temporaryPassword}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Sign-in page</dt>
          <dd className="truncate">{credentials.loginUrl}</dd>
        </div>
      </dl>
      <Button
        className="mt-4"
        block
        icon={<Copy className="size-4" />}
        onClick={() => copyToClipboard(message).then(() => toast.success('Copied the welcome message'))}
      >
        Copy welcome message
      </Button>
    </Modal>
  );
}
