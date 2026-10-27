import { TICKET_CATEGORY_LABELS, timeAgo, type Ticket } from '@smartcart/shared';
import { Lock, Send } from 'lucide-react';
import { useState } from 'react';
import { PriorityBadge, TicketStatusBadge } from '@/components/status';
import { Avatar, Badge, Button, Textarea, Toggle } from '@/components/ui';
import { cn, formatDateTime } from '@/lib/utils';

/** Conversation between a store and the SmartCart team about one request. */
export function TicketThread({
  ticket,
  viewer,
  onReply,
  sending,
}: {
  ticket: Ticket;
  viewer: 'STORE' | 'ADMIN';
  onReply?: (body: string, isInternal: boolean) => void;
  sending?: boolean;
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const closed = ticket.status === 'CLOSED';
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-500">{ticket.ticketNumber}</span>
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <Badge tone="gray">{TICKET_CATEGORY_LABELS[ticket.category]}</Badge>
        </div>
        <h2 className="text-lg font-bold text-slate-900">{ticket.subject}</h2>
        <p className="text-xs text-slate-500">
          {ticket.storeName} · raised by {ticket.raisedBy.name} {timeAgo(ticket.createdAt)}
          {ticket.assignedAdmin && ` · handled by ${ticket.assignedAdmin.name}`}
          {ticket.relatedEmployee && ` · about ${ticket.relatedEmployee.name}`}
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Message name={ticket.raisedBy.name} side="STORE" at={ticket.createdAt} body={ticket.description} mine={viewer === 'STORE'} />
        {ticket.messages.map((m) => (
          <Message
            key={m.id}
            name={m.author.name}
            side={m.author.side}
            at={m.createdAt}
            body={m.body}
            internal={m.isInternal}
            mine={m.author.side === viewer}
          />
        ))}
      </div>
      {onReply && !closed && (
        <form
          className="space-y-2 border-t border-slate-100 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            onReply(body.trim(), internal);
            setBody('');
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={viewer === 'ADMIN' ? 'Reply to the store…' : 'Add details or reply to the SmartCart team…'}
            className={cn(internal && 'bg-amber-50')}
          />
          <div className="flex items-center justify-between gap-2">
            {viewer === 'ADMIN' ? (
              <Toggle checked={internal} onChange={setInternal} label="Internal note (hidden from the store)" />
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" icon={<Send className="size-4" />} loading={sending} disabled={!body.trim()}>
              {internal ? 'Add note' : 'Send'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Message({
  name,
  side,
  at,
  body,
  internal,
  mine,
}: {
  name: string;
  side: 'STORE' | 'ADMIN';
  at: string;
  body: string;
  internal?: boolean;
  mine: boolean;
}) {
  return (
    <div className={cn('flex gap-3', mine && 'flex-row-reverse')}>
      <Avatar name={name} size="sm" />
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
          internal ? 'border border-dashed border-amber-300 bg-amber-50' : mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800',
        )}
      >
        <p className={cn('text-xs font-semibold', mine && !internal ? 'text-white/80' : 'text-slate-500')}>
          {internal && <Lock className="mr-1 inline size-3" />}
          {name} · {side === 'ADMIN' ? 'SmartCart' : 'Store'} · {formatDateTime(at)}
        </p>
        <p className="mt-1 whitespace-pre-line">{body}</p>
      </div>
    </div>
  );
}
