import {
  CREDENTIAL_REQUEST_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type CredentialRequestStatus,
  type Priority,
  type TaskStatus,
  type TicketStatus,
} from '@smartcart/shared';
import { Badge } from '@/components/ui';

type Tone = Parameters<typeof Badge>[0]['tone'];

const taskTone: Record<TaskStatus, Tone> = {
  TODO: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'yellow',
  APPROVED: 'green',
  REOPENED: 'orange',
  CANCELLED: 'gray',
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={taskTone[status]}>{status === 'DONE' ? 'Awaiting review' : TASK_STATUS_LABELS[status]}</Badge>;
}

const priorityTone: Record<Priority, Tone> = { LOW: 'gray', MEDIUM: 'blue', HIGH: 'orange', URGENT: 'red' };
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={priorityTone[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

const requestTone: Record<CredentialRequestStatus, Tone> = {
  PENDING_OWNER: 'yellow',
  OWNER_CHANGES_REQUESTED: 'orange',
  PENDING_ADMIN: 'blue',
  ADMIN_CHANGES_REQUESTED: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};
export function RequestStatusBadge({ status }: { status: CredentialRequestStatus }) {
  return <Badge tone={requestTone[status]}>{CREDENTIAL_REQUEST_STATUS_LABELS[status]}</Badge>;
}

const ticketTone: Record<TicketStatus, Tone> = {
  OPEN: 'yellow',
  IN_PROGRESS: 'blue',
  WAITING_ON_STORE: 'orange',
  RESOLVED: 'green',
  CLOSED: 'gray',
};
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={ticketTone[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}
