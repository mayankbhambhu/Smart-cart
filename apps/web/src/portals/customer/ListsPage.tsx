import { timeAgo, type ShoppingList, type ShoppingListSummary } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageLoader } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const EMOJIS = ['🛒', '🏠', '🥦', '🍎', '🥛', '🎉', '🍳', '🧺', '👶', '🐶'];

export default function ListsPage() {
  const { data: lists, isLoading } = useQuery({ queryKey: ['lists'], queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists') });
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Family lists</h1>
          <p className="text-sm text-slate-500">
            Shared lists sync live. When someone adds milk at home, it shows up on the shopper's phone in the store.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Users className="size-4" />} onClick={() => setJoining(true)}>
            Join with code
          </Button>
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New list
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !lists || lists.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No lists yet"
          body="Create a list and share the code with your family to shop together."
          action={<Button onClick={() => setCreating(true)}>Create your first list</Button>}
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {lists.map((list) => (
            <Link key={list.id} to={`/lists/${list.id}`}>
              <Card className="h-full p-5 transition-shadow hover:shadow-pop">
                <div className="flex items-start gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl">{list.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{list.name}</p>
                    <p className="text-sm text-slate-500">
                      {list.itemCount - list.checkedCount} to buy · {list.checkedCount} done
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${list.itemCount ? (list.checkedCount / list.itemCount) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {list.members.slice(0, 5).map((m) => (
                      <Avatar key={m.userId} name={m.name} size="sm" className="ring-2 ring-white" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">Updated {timeAgo(list.updatedAt)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateListModal open={creating} onClose={() => setCreating(false)} />
      <JoinListModal open={joining} onClose={() => setJoining(false)} />
    </div>
  );
}

function CreateListModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('Weekly groceries');
  const [emoji, setEmoji] = useState('🛒');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>('/lists', { name, emoji }),
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      onClose();
      navigate(`/lists/${list.id}`);
    },
    onError: (error) => toast.error('Could not create the list', errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New shared list"
      footer={
        <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
          Create list
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <div>
          <p className="text-sm font-medium text-slate-700">Icon</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  'flex size-11 items-center justify-center rounded-xl border text-xl',
                  emoji === e ? 'border-brand-600 bg-brand-50' : 'border-slate-200',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function JoinListModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const join = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>('/lists/join', { code }),
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success(`You joined "${list.name}"`);
      onClose();
      navigate(`/lists/${list.id}`);
    },
    onError: (error) => toast.error('Could not join', errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a family list"
      description="Ask the list owner for the invite code shown on their list."
      footer={
        <Button loading={join.isPending} disabled={code.length < 6} onClick={() => join.mutate()}>
          Join list
        </Button>
      }
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        placeholder="e.g. K7M2QX"
        className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
        maxLength={10}
        autoFocus
      />
    </Modal>
  );
}
