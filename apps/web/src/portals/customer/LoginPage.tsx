import type { AuthProvidersInfo, AuthSession, CustomerProfile, OtpRequestResult } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Card, Field, Input, Modal, Segmented } from '@/components/ui';
import { ApiError, customerApi, errorMessage, publicApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextPath } from '@/lib/session';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

export default function LoginPage() {
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const navigate = useNavigate();
  const location = useLocation();
  const done = (session: AuthSession) => {
    useAuth.getState().setSession('CUSTOMER', session);
    // Shop from the customer's home store after signing in.
    void customerApi
      .get<CustomerProfile>('/me/profile')
      .then((profile) => profile.defaultStoreId && useShop.getState().setStore(profile.defaultStoreId))
      .catch(() => undefined);
    toast.success(`Welcome, ${session.user.name.split(' ')[0]}!`);
    navigate(nextPath(location.search, '/'), { replace: true });
  };
  const { data: providers } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => publicApi.get<AuthProvidersInfo>('/auth/providers'),
  });

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10">
      <Logo />
      <Card className="mt-6 w-full p-6">
        <h1 className="text-xl font-extrabold text-slate-900">Log in or sign up</h1>
        <p className="mt-1 text-sm text-slate-500">Use your phone number, email, Google or Apple.</p>
        <Segmented
          className="mt-5 w-full [&>button]:flex-1"
          value={method}
          onChange={setMethod}
          options={[
            {
              value: 'phone',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" /> Phone
                </span>
              ),
            },
            {
              value: 'email',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-4" /> Email
                </span>
              ),
            },
          ]}
        />
        <div className="mt-5">{method === 'phone' ? <PhoneLogin onDone={done} /> : <EmailLogin onDone={done} />}</div>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or continue with <span className="h-px flex-1 bg-slate-200" />
        </div>
        <SocialButtons providers={providers} onDone={done} />
      </Card>
      <p className="mt-6 text-center text-xs text-slate-500">
        Demo account: <span className="font-semibold">priya@example.com</span> / <span className="font-semibold">Customer@123</span> or
        phone <span className="font-semibold">99000 00001</span> (the OTP is shown in development).
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Store staff?{' '}
        <Link to="/ops/login" className="font-semibold text-brand-700">
          Sign in to Store OS
        </Link>
      </p>
    </div>
  );
}

function PhoneLogin({ onDone }: { onDone: (session: AuthSession) => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await publicApi.post<OtpRequestResult>('/auth/otp/request', { phone });
      setSent(result);
      if (result.devCode) setCode(result.devCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await publicApi.post<AuthSession>('/auth/otp/verify', { phone, code, name: name || undefined }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_REQUIRED') setNeedsName(true);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form onSubmit={request} className="space-y-4">
        <Field label="Mobile number" error={error ?? undefined}>
          <div className="flex">
            <span className="flex items-center rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
              +91
            </span>
            <Input
              className="rounded-l-none"
              inputMode="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
            />
          </div>
        </Field>
        <Button type="submit" block size="lg" loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
          Send OTP
        </Button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-semibold">+91 {phone}</span>.{' '}
        <button type="button" className="font-semibold text-brand-700" onClick={() => setSent(null)}>
          Change
        </button>
      </p>
      {sent.devCode && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Development mode: your code is {sent.devCode} (pre-filled).
        </p>
      )}
      <Field label="One-time code">
        <Input
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center text-lg tracking-[0.5em]"
        />
      </Field>
      {needsName && (
        <Field label="Your name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Field>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6}>
        {needsName ? 'Create account' : 'Verify & continue'}
      </Button>
      <button type="button" className="w-full text-center text-sm font-semibold text-slate-500" onClick={() => void request()}>
        Resend code
      </button>
    </form>
  );
}

function EmailLogin({ onDone }: { onDone: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onDone(
            mode === 'login'
              ? await publicApi.post<AuthSession>('/auth/login', { email: form.email, password: form.password })
              : await publicApi.post<AuthSession>('/auth/register', form),
          );
        } catch (err) {
          setError(err as Error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {mode === 'register' && (
        <Field label="Full name" error={fieldErrors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
        </Field>
      )}
      <Field label="Email" error={fieldErrors.email}>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field
        label="Password"
        error={fieldErrors.password}
        hint={mode === 'register' ? 'At least 8 characters with a letter and a number' : undefined}
      >
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </Field>
      {error && Object.keys(fieldErrors).length === 0 && <p className="text-sm text-rose-600">{error.message}</p>}
      <Button type="submit" block size="lg" loading={busy}>
        {mode === 'login' ? 'Log in' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        {mode === 'login' ? 'New to SmartCart?' : 'Already have an account?'}{' '}
        <button type="button" className="font-semibold text-brand-700" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </button>
      </p>
    </form>
  );
}

function SocialButtons({ providers, onDone }: { providers?: AuthProvidersInfo; onDone: (session: AuthSession) => void }) {
  const [demo, setDemo] = useState<'google' | 'apple' | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const start = (provider: 'google' | 'apple') => {
    const info = providers?.[provider];
    if (!info?.enabled) return toast.error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in is not configured`);
    if (info.demo) return setDemo(provider);
    toast.info(
      'Configure the OAuth client to enable real sign-in',
      'See docs/AUTH.md for Google Identity Services and Sign in with Apple JS.',
    );
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="outline" size="lg" onClick={() => start('google')}>
        <span className="text-lg font-black text-[#4285F4]">G</span> Google
      </Button>
      <Button variant="dark" size="lg" onClick={() => start('apple')}>
        Apple
      </Button>
      <Modal
        open={Boolean(demo)}
        onClose={() => setDemo(null)}
        title={`Continue with ${demo === 'google' ? 'Google' : 'Apple'}`}
        description="Demo mode: no OAuth client is configured, so this simulates the provider's consent screen."
        footer={
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onDone(await publicApi.post<AuthSession>('/auth/demo-social', { provider: demo, ...form }));
              } catch (err) {
                toast.error('Sign-in failed', errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Continue
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@gmail.com"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
