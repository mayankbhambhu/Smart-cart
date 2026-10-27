import { STAFF_ROLE_LABELS, type AuthSession } from '@smartcart/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Button, Field, H1, Muted } from '@/components/ui';
import { ApiError, errorMessage, logout, publicApi, staffApi } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { useStaffStore } from '@/lib/stores';
import { toast } from '@/lib/toast';

/** Employee sign-in (username, employee code or email) and the first-sign-in password change. */
export default function StaffLoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession('STAFF');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};

  const enter = async (next: AuthSession) => {
    if (next.memberships.length === 0) {
      await logout('STAFF');
      toast.error('No store assigned', 'This account is not linked to a store yet. Ask your store manager.');
      return;
    }
    await useAuth.getState().setSession('STAFF', next);
    const current = useStaffStore.getState().storeId;
    if (!next.memberships.some((m) => m.storeId === current)) useStaffStore.getState().setStore(next.memberships[0]!.storeId);
    void queryClient.invalidateQueries();
    if (!next.user.mustChangePassword) {
      toast.success(
        `Welcome back, ${next.user.name.split(' ')[0]}`,
        `${STAFF_ROLE_LABELS[next.memberships[0]!.role]} · ${next.memberships[0]!.storeName}`,
      );
      router.replace('/staff');
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await enter(await publicApi.post<AuthSession>('/auth/staff/login', { identifier: identifier.trim(), password }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {session?.user.mustChangePassword ? (
          <ChangePassword currentHint={password} onDone={enter} />
        ) : (
          <View>
            <View style={styles.badge}>
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>STORE OS</Text>
            </View>
            <H1 style={{ marginTop: space.md }}>Sign in to staff mode</H1>
            <Muted style={{ marginTop: 4, marginBottom: space.lg }}>
              Clock in, see your tasks and restock alerts, and verify exit passes and pickups.
            </Muted>
            <Field
              label="Username, employee code or email"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              error={fieldErrors.identifier}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              error={fieldErrors.password}
              returnKeyType="go"
              onSubmitEditing={() => void signIn()}
            />
            {error && !Object.keys(fieldErrors).length ? (
              <Text style={{ color: colors.danger, marginBottom: space.sm }}>{errorMessage(error)}</Text>
            ) : null}
            <Button
              title="Sign in"
              size="lg"
              block
              loading={busy}
              disabled={identifier.trim().length < 3 || !password}
              onPress={() => void signIn()}
            />
            <Muted style={{ marginTop: space.xl, fontSize: 12, textAlign: 'center' }}>
              New employee? Your store manager requests your login; you get it once the owner and SmartCart approve. Demo: kavya.reddy /
              Staff@1234
            </Muted>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChangePassword({ currentHint, onDone }: { currentHint: string; onDone: (session: AuthSession) => Promise<void> }) {
  const [current, setCurrent] = useState(currentHint);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next !== confirm) {
      setErrors({ confirm: 'The passwords do not match' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const session = await staffApi.post<AuthSession>('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password updated', 'Welcome to Store OS!');
      await onDone(session);
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fieldErrors, form: err.message } : { form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <H1>🔑 Choose your own password</H1>
      <Muted style={{ marginTop: 4, marginBottom: space.lg }}>You signed in with a temporary password. Set a new one to continue.</Muted>
      <Field
        label="Temporary password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        textContentType="password"
        error={errors.currentPassword}
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        textContentType="newPassword"
        hint="At least 8 characters with a letter and a number."
        error={errors.newPassword}
        autoFocus
      />
      <Field
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
        error={errors.confirm ?? errors.form}
      />
      <Button title="Save and continue" size="lg" block loading={busy} disabled={!next || !confirm} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
});
