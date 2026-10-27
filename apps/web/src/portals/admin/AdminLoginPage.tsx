import type { AuthSession } from '@smartcart/shared';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Card, Field, Input } from '@/components/ui';
import { errorMessage, publicApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextPath, useBootstrap } from '@/lib/session';

/** Sign-in for the SmartCart team (super admins, admins and support). */
export default function AdminLoginPage() {
  const ready = useBootstrap('ADMIN');
  const session = useAuth((s) => s.sessions.ADMIN);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) navigate(nextPath(location.search, '/admin'), { replace: true });
  }, [ready, session, navigate, location.search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      useAuth.getState().setSession('ADMIN', await publicApi.post<AuthSession>('/auth/admin/login', { email, password }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo dark subtitle="Admin console" />
        </div>
        <Card className="mt-6 p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                <ShieldCheck className="size-5 text-indigo-600" /> SmartCart team
              </h1>
              <p className="mt-1 text-sm text-slate-500">Approve store logins, manage stores and answer store requests.</p>
            </div>
            <Field label="Work email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="you@smartcart.dev"
              />
            </Field>
            <Field label="Password" error={error ?? undefined}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Button type="submit" block size="lg" variant="dark" loading={busy}>
              Sign in
            </Button>
          </form>
        </Card>
        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5"
          onClick={() => {
            setEmail('admin@smartcart.dev');
            setPassword('Admin@1234');
          }}
        >
          <span className="font-semibold text-slate-200">Demo:</span> admin@smartcart.dev / Admin@1234 (also ops@ and support@)
        </button>
      </div>
    </div>
  );
}
