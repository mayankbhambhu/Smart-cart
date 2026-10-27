import type { AuthProvidersInfo, AuthSession, CustomerProfile, OtpRequestResult } from '@smartcart/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Button, Field, H1, Muted, Row, Segmented, Sheet } from '@/components/ui';
import { ApiError, customerApi, errorMessage, publicApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/config';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

/** Shopper sign-in: phone OTP, email and password, Google or Apple. */
export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const { data: providers } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => publicApi.get<AuthProvidersInfo>('/auth/providers'),
    staleTime: 10 * 60_000,
  });

  const done = async (session: AuthSession) => {
    await useAuth.getState().setSession('CUSTOMER', session);
    void queryClient.invalidateQueries();
    // Shop from the customer's home store after signing in.
    void customerApi
      .get<CustomerProfile>('/me/profile')
      .then((profile) => profile.defaultStoreId && useShop.getState().setStore(profile.defaultStoreId))
      .catch(() => undefined);
    toast.success(`Welcome, ${session.user.name.split(' ')[0]}!`);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={{ fontSize: 30 }}>🛒</Text>
        </View>
        <H1 style={{ marginTop: space.md }}>Groceries in minutes</H1>
        <Muted style={{ marginTop: 4 }}>Log in or sign up with your phone number, email, Google or Apple.</Muted>
        <View style={{ marginTop: space.lg }}>
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: 'phone', label: '📱 Phone' },
              { value: 'email', label: '✉️ Email' },
            ]}
          />
        </View>
        <View style={{ marginTop: space.lg }}>{method === 'phone' ? <PhoneLogin onDone={done} /> : <EmailLogin onDone={done} />}</View>
        <SocialButtons providers={providers} onDone={done} />
        <Muted style={{ textAlign: 'center', fontSize: 12, marginTop: space.xl }}>
          Demo account: priya@example.com / Customer@123, or phone 99000 00001 (the code is shown in development).
        </Muted>
        <Pressable onPress={() => router.replace('/staff/login')} style={{ marginTop: space.md, alignSelf: 'center', padding: 8 }}>
          <Text style={{ color: colors.brandDark, fontWeight: '700' }}>Store staff? Sign in to staff mode</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PhoneLogin({ onDone }: { onDone: (session: AuthSession) => Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
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
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDone(await publicApi.post<AuthSession>('/auth/otp/verify', { phone, code, name: name.trim() || undefined }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_REQUIRED') setNeedsName(true);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <View>
        <Text style={styles.label}>Mobile number</Text>
        <Row gap={0}>
          <View style={styles.prefix}>
            <Text style={{ fontWeight: '700', color: colors.muted }}>+91</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Field
              value={phone}
              onChangeText={setPhone}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              autoFocus
              error={error ?? undefined}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              returnKeyType="done"
              onSubmitEditing={() => phone.replace(/\D/g, '').length >= 10 && void request()}
            />
          </View>
        </Row>
        <Button
          title="Send OTP"
          size="lg"
          block
          loading={busy}
          disabled={phone.replace(/\D/g, '').length < 10}
          onPress={() => void request()}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.text }}>
        We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>+91 {phone}</Text>.{' '}
        <Text style={{ color: colors.brandDark, fontWeight: '700' }} onPress={() => setSent(null)}>
          Change
        </Text>
      </Text>
      {sent.devCode && <Text style={styles.dev}>Development mode: your code is {sent.devCode} (pre-filled).</Text>}
      <Field
        label="One-time code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        style={{ textAlign: 'center', fontSize: 22, letterSpacing: 10, fontWeight: '800', height: 56 }}
      />
      {needsName && (
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Full name" textContentType="name" autoFocus />
      )}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button
        title={needsName ? 'Create account' : 'Verify & continue'}
        size="lg"
        block
        loading={busy}
        disabled={code.length !== 6 || (needsName && name.trim().length < 2)}
        onPress={() => void verify()}
      />
      <Button title="Resend code" variant="ghost" size="sm" onPress={() => void request()} />
    </View>
  );
}

function EmailLogin({ onDone }: { onDone: (session: AuthSession) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDone(
        mode === 'login'
          ? await publicApi.post<AuthSession>('/auth/login', { email: form.email.trim(), password: form.password })
          : await publicApi.post<AuthSession>('/auth/register', { ...form, email: form.email.trim() }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      {mode === 'register' && (
        <Field
          label="Full name"
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
          textContentType="name"
          error={fieldErrors.name}
        />
      )}
      <Field
        label="Email"
        value={form.email}
        onChangeText={(email) => setForm({ ...form, email })}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        value={form.password}
        onChangeText={(password) => setForm({ ...form, password })}
        secureTextEntry
        textContentType={mode === 'login' ? 'password' : 'newPassword'}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        hint={mode === 'register' ? 'At least 8 characters with a letter and a number' : undefined}
        error={fieldErrors.password}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {error && !Object.keys(fieldErrors).length ? (
        <Text style={{ color: colors.danger, marginBottom: space.sm }}>{errorMessage(error)}</Text>
      ) : null}
      <Button
        title={mode === 'login' ? 'Log in' : 'Create account'}
        size="lg"
        block
        loading={busy}
        disabled={!form.email || !form.password}
        onPress={() => void submit()}
      />
      <Button
        title={mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        variant="ghost"
        size="sm"
        style={{ marginTop: space.sm }}
        onPress={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
      />
    </View>
  );
}

function SocialButtons({ providers, onDone }: { providers?: AuthProvidersInfo; onDone: (session: AuthSession) => Promise<void> }) {
  const [demo, setDemo] = useState<'google' | 'apple' | null>(null);
  const [appleNative, setAppleNative] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleNative);
  }, []);

  const google = async () => {
    const info = providers?.google;
    if (!info?.enabled) return toast.error('Google sign-in is not configured');
    if (info.demo) return setDemo('google');
    setBusy('google');
    try {
      // Google Identity Services runs on the web app (its client id); the token comes back through the app's link.
      const returnUrl = Linking.createURL('auth/google');
      const result = await WebBrowser.openAuthSessionAsync(
        `${WEB_URL}/auth/google-bridge?return=${encodeURIComponent(returnUrl)}`,
        returnUrl,
      );
      if (result.type !== 'success') return;
      const idToken = Linking.parse(result.url).queryParams?.id_token;
      if (typeof idToken !== 'string') return;
      await onDone(await publicApi.post<AuthSession>('/auth/google', { idToken }));
    } catch (error) {
      toast.error('Google sign-in failed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const apple = async () => {
    const info = providers?.apple;
    if (!info?.enabled) return toast.error('Sign in with Apple is not configured');
    if (info.demo || !appleNative) return setDemo('apple');
    setBusy('apple');
    try {
      const rawNonce = Crypto.randomUUID();
      const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce,
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token');
      // Apple shares the name only on the first sign-in.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      await onDone(
        await publicApi.post<AuthSession>('/auth/apple', {
          idToken: credential.identityToken,
          nonce: rawNonce,
          name: name.length >= 2 ? name : undefined,
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      toast.error('Sign in with Apple failed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  // Google goes through the web client; Apple is native on iOS. Each also has the demo stand-in.
  const showGoogle = Boolean(providers?.google.demo || (providers?.google.enabled && providers.google.webClientId));
  const showApple = Boolean(providers?.apple.demo || (providers?.apple.enabled && appleNative));
  if (!showGoogle && !showApple) return null;
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ marginTop: space.lg, marginBottom: space.sm }}>
        <View style={styles.rule} />
        <Muted style={{ fontSize: 12 }}>or continue with</Muted>
        <View style={styles.rule} />
      </Row>
      {showGoogle && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void google()}
          disabled={busy !== null}
          style={({ pressed }) => [styles.social, pressed && { opacity: 0.8 }]}
        >
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#4285F4' }}>G</Text>
          <Text style={styles.socialText}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
        </Pressable>
      )}
      {showApple &&
        (appleNative && !providers?.apple.demo ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md}
            style={{ height: 50 }}
            onPress={() => void apple()}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void apple()}
            style={({ pressed }) => [styles.social, styles.apple, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={[styles.socialText, { color: '#fff' }]}>Continue with Apple</Text>
          </Pressable>
        ))}
      <DemoSocialSheet provider={demo} onClose={() => setDemo(null)} onDone={onDone} />
    </View>
  );
}

/** Development stand-in for the provider's consent screen when no OAuth client is configured. */
function DemoSocialSheet({
  provider,
  onClose,
  onDone,
}: {
  provider: 'google' | 'apple' | null;
  onClose: () => void;
  onDone: (session: AuthSession) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Sheet visible={Boolean(provider)} onClose={onClose} title={`Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`}>
      <Muted style={{ marginBottom: space.lg }}>
        Demo mode: no OAuth client is configured, so this simulates the provider's consent screen.
      </Muted>
      <Field
        label="Name"
        value={form.name}
        onChangeText={(name) => setForm({ ...form, name })}
        placeholder="Your name"
        textContentType="name"
      />
      <Field
        label="Email"
        value={form.email}
        onChangeText={(email) => setForm({ ...form, email })}
        placeholder="you@gmail.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button
        title="Continue"
        size="lg"
        loading={busy}
        disabled={form.name.trim().length < 2 || !form.email.includes('@')}
        onPress={async () => {
          setBusy(true);
          try {
            const session = await publicApi.post<AuthSession>('/auth/demo-social', {
              provider,
              name: form.name.trim(),
              email: form.email.trim(),
            });
            onClose();
            await onDone(session);
          } catch (error) {
            toast.error('Sign-in failed', errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  prefix: {
    height: 46,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: '#cbd5e1',
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    backgroundColor: '#f1f5f9',
    marginBottom: space.md,
  },
  dev: { backgroundColor: colors.warningSoft, color: colors.warning, padding: space.sm, borderRadius: radius.sm, fontSize: 12 },
  social: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  apple: { backgroundColor: '#000', borderColor: '#000' },
  socialText: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
