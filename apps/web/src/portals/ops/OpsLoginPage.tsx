import type { AuthSession } from '@smartcart/shared';
import { KeyRound, Store } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Card, Field, Input } from '@/components/ui';
import { ApiError, errorMessage, publicApi, staffApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextPath, useBootstrap } from '@/lib/session';
import { useOpsStore } from '@/lib/stores';
import { toast } from '@/lib/toast';

const DEMO_STAFF = [
  { username: 'arjun.mehta', label: 'Store owner' },
  { username: 'kavya.reddy', label: 'Store manager' },
  { username: 'vikram.singh', label: 'Floor manager' },
  { username: 'rahul.yadav', label: 'Worker (warehouse)' },
];

/** Store OS sign-in for owners, managers and workers, with the forced first-login password change. */
export default function OpsLoginPage() {
  const ready = useBootstrap('STAFF');
  const session = useAuth((s) => s.sessions.STAFF);
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = (s: AuthSession) => {
    useAuth.getState().setSession('STAFF', s);
    const first = s.memberships[0];
    const current = useOpsStore.getState().storeId;
    if (first && !s.memberships.some((m) => m.storeId === current)) useOpsStore.getState().setStore(first.storeId);
  };

  useEffect(() => {
    if (ready && session && !session.user.mustChangePassword) navigate(nextPath(location.search, '/ops'), { replace: true });
  }, [ready, session, navigate, location.search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await publicApi.post<AuthSession>('/auth/staff/login', { identifier, password });
      finish(result);
      if (!result.user.mustChangePassword) toast.success(`Welcome back, ${result.user.name.split(' ')[0]}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <Logo dark subtitle="Store OS" />
        </div>
        <Card className="mt-6 p-6">
          {session?.user.mustChangePassword ? (
            <ChangePassword currentHint={password} onDone={finish} />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">Sign in to your store</h1>
                <p className="mt-1 text-sm text-slate-500">Use the username or employee code from your SmartCart welcome message.</p>
              </div>
              <Field label="Username, employee code or email">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="kavya.reddy"
                />
              </Field>
              <Field label="Password" error={error ?? undefined}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <Button type="submit" block size="lg" loading={busy} icon={<Store className="size-4" />}>
                Sign in
              </Button>
            </form>
          )}
        </Card>
        <div className="mt-6 rounded-2xl border border-white/10 p-4 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">Demo accounts (password Staff@1234)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO_STAFF.map((d) => (
              <button
                key={d.username}
                type="button"
                className="rounded-lg bg-white/5 px-2 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  setIdentifier(d.username);
                  setPassword('Staff@1234');
                }}
              >
                <span className="block font-semibold text-slate-200">{d.label}</span>
                {d.username}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          New employee? Your store manager requests your login; you get it once the owner and SmartCart approve.{' '}
          <Link to="/" className="font-semibold text-brand-400">
            Back to the shop
          </Link>
        </p>
      </div>
    </div>
  );
}

function ChangePassword({ currentHint, onDone }: { currentHint: string; onDone: (session: AuthSession) => void }) {
  const [current, setCurrent] = useState(currentHint);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (next !== confirm) {
          setErrors({ confirm: 'The passwords do not match' });
          return;
        }
        setBusy(true);
        setErrors({});
        try {
          const session = await staffApi.post<AuthSession>('/auth/change-password', { currentPassword: current, newPassword: next });
          onDone(session);
          toast.success('Password updated', 'Welcome to Store OS!');
        } catch (err) {
          setErrors(err instanceof ApiError ? { ...err.fieldErrors, form: err.message } : { form: errorMessage(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
          <KeyRound className="size-5 text-brand-600" /> Choose your own password
        </h1>
        <p className="mt-1 text-sm text-slate-500">You signed in with a temporary password. Set a new one to continue.</p>
      </div>
      <Field label="Temporary password" error={errors.currentPassword}>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="New password" error={errors.newPassword} hint="At least 8 characters with a letter and a number.">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Confirm new password" error={errors.confirm ?? errors.form}>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      <Button type="submit" block size="lg" loading={busy}>
        Save and continue
      </Button>
    </form>
  );
}
