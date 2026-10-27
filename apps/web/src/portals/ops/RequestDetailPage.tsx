import { SocketEvents, type CredentialRequest } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, MessageSquareWarning, Pencil, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CandidateCard, RequestTimeline } from '@/components/requests';
import { Button, Card, ErrorState, Field, Modal, PageLoader, Textarea } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { PageHeader, RequestStatusBadge } from './components';
import { useLiveInvalidate, useOps } from './hooks';

type Decision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export default function RequestDetailPage() {
  const { requestId } = useParams();
  const ops = useOps();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSession('STAFF')!.user.id;
  const key = ['ops-request', requestId];
  const {
    data: request,
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: key, queryFn: () => ops.get<CredentialRequest>(`/requests/${requestId}`) });
  const [deciding, setDeciding] = useState<Decision | null>(null);
  useLiveInvalidate([SocketEvents.REQUEST_CHANGED], [key], 300);

  const cancel = useMutation({
    mutationFn: () => ops.post<CredentialRequest>(`/requests/${requestId}/cancel`),
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
      toast.success('Request cancelled');
    },
    onError: (err) => toast.error('Could not cancel', errorMessage(err)),
  });

  if (isLoading) return <PageLoader />;
  if (error || !request) return <ErrorState error={error} retry={() => void refetch()} />;

  const mine = ops.isOwner || request.requestedBy.id === userId;
  const editable = mine && ['PENDING_OWNER', 'OWNER_CHANGES_REQUESTED', 'ADMIN_CHANGES_REQUESTED'].includes(request.status);
  const closed = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(request.status);
  const ownerToReview = ops.isOwner && request.status === 'PENDING_OWNER';

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/ops/team" className="text-sm font-semibold text-brand-700">
        ← Team
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {request.candidate.fullName} <RequestStatusBadge status={request.status} />
          </span>
        }
        subtitle={`${request.requestNumber} · ${request.storeName}`}
        actions={
          <>
            {editable && (
              <Button
                variant="outline"
                icon={<Pencil className="size-4" />}
                onClick={() => navigate(`/ops/team/requests/new?edit=${request.id}`)}
              >
                {request.status === 'PENDING_OWNER' ? 'Edit' : 'Fix and resubmit'}
              </Button>
            )}
            {mine && !closed && (
              <Button variant="ghost" className="text-rose-600" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel request
              </Button>
            )}
          </>
        }
      />

      {ownerToReview && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50 p-4">
          <p className="flex-1 text-sm text-amber-900">
            <strong>{request.requestedBy.name}</strong> asked for a login for this employee. Approve to send it to the SmartCart team, or
            send it back with a note.
          </p>
          <Button variant="outline" icon={<MessageSquareWarning className="size-4" />} onClick={() => setDeciding('REQUEST_CHANGES')}>
            Send back
          </Button>
          <Button variant="ghost" className="text-rose-600" icon={<XCircle className="size-4" />} onClick={() => setDeciding('REJECT')}>
            Reject
          </Button>
          <Button icon={<CheckCircle2 className="size-4" />} onClick={() => setDeciding('APPROVE')}>
            Approve
          </Button>
        </Card>
      )}
      {(request.status === 'OWNER_CHANGES_REQUESTED' || request.status === 'ADMIN_CHANGES_REQUESTED') && request.lastComment && (
        <Card className="mb-5 border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-semibold">
            {request.status === 'OWNER_CHANGES_REQUESTED' ? 'The owner' : 'The SmartCart team'} asked for changes
          </p>
          <p className="mt-1">“{request.lastComment}”</p>
        </Card>
      )}
      {request.issued && (
        <Card className="mb-5 flex items-start gap-3 border-brand-200 bg-brand-50 p-4 text-sm">
          <KeyRound className="mt-0.5 size-5 text-brand-700" />
          <div>
            <p className="font-semibold text-brand-900">Login issued</p>
            <p className="text-brand-900">
              Username <strong className="font-mono">{request.issued.username}</strong> · employee code{' '}
              <strong className="font-mono">{request.issued.employeeCode}</strong>
            </p>
            <p className="mt-1 text-xs text-brand-800">
              The SmartCart team shares the temporary password with the employee. They choose their own password at first sign-in.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <CandidateCard request={request} showWage={ops.isLeadership} />
        <RequestTimeline request={request} />
      </div>

      {deciding && (
        <DecisionModal
          request={request}
          decision={deciding}
          onClose={() => setDeciding(null)}
          onDone={(updated) => queryClient.setQueryData(key, updated)}
        />
      )}
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
  onDone: (request: CredentialRequest) => void;
}) {
  const ops = useOps();
  const [comment, setComment] = useState('');
  const review = useMutation({
    mutationFn: () => ops.post<CredentialRequest>(`/requests/${request.id}/review`, { decision, comment: comment || undefined }),
    onSuccess: (updated) => {
      toast.success(
        decision === 'APPROVE' ? 'Approved and sent to SmartCart' : decision === 'REJECT' ? 'Request rejected' : 'Sent back for changes',
      );
      onDone(updated);
      onClose();
    },
    onError: (err) => toast.error('Could not save your decision', errorMessage(err)),
  });
  const titles: Record<Decision, string> = {
    APPROVE: 'Approve this login request?',
    REQUEST_CHANGES: 'Send back for changes',
    REJECT: 'Reject this request',
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={titles[decision]}
      description={`${request.candidate.fullName} · ${request.requestNumber}`}
      footer={
        <Button
          variant={decision === 'REJECT' ? 'danger' : 'primary'}
          loading={review.isPending}
          disabled={decision !== 'APPROVE' && comment.trim().length < 3}
          onClick={() => review.mutate()}
        >
          {decision === 'APPROVE' ? 'Approve' : decision === 'REJECT' ? 'Reject' : 'Send back'}
        </Button>
      }
    >
      <Field label={decision === 'APPROVE' ? 'Note for the SmartCart team (optional)' : 'What needs to change?'}>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          autoFocus
          placeholder={decision === 'APPROVE' ? '' : 'Please add the emergency contact and correct the wage.'}
        />
      </Field>
    </Modal>
  );
}
