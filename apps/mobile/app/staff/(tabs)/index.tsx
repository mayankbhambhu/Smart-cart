import {
  DEPARTMENT_LABELS,
  SocketEvents,
  STAFF_ROLE_LABELS,
  formatDuration,
  initials,
  parseKioskUri,
  type AttendanceRecord,
  type MyAttendance,
  type RestockAlert,
  type Task,
} from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ScannerModal } from '@/components/Scanner';
import { colors, space } from '@/components/theme';
import { Badge, Button, Card, Chip, H1, H2, Loader, Muted, Row, Screen, SectionTitle } from '@/components/ui';
import { errorMessage, logout } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDate, formatTime } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useLiveInvalidate, useStaff, useStoreRoom } from '@/lib/staff';
import { useStaffStore } from '@/lib/stores';
import { toast } from '@/lib/toast';

/** The employee's day: shift, clock in/out, their open tasks and the store's restock alerts. */
export default function StaffTodayScreen() {
  const staff = useStaff();
  const name = useSession('STAFF')?.user.name ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const setStore = useStaffStore((s) => s.setStore);
  useStoreRoom(staff?.storeId);
  const tasks = useQuery({
    queryKey: ['staff-tasks', staff?.storeId, 'mine'],
    queryFn: () => staff!.get<Task[]>('/tasks', { scope: 'mine', status: 'TODO,IN_PROGRESS,REOPENED', limit: 5 }),
    enabled: Boolean(staff),
  });
  const alerts = useQuery({
    queryKey: ['staff-alerts', staff?.storeId, 'ACTIVE'],
    queryFn: () => staff!.get<RestockAlert[]>('/alerts', { status: 'ACTIVE', limit: 100 }),
    enabled: Boolean(staff),
  });
  useLiveInvalidate(SocketEvents.TASK_CHANGED, [['staff-tasks', staff?.storeId]]);
  useLiveInvalidate(SocketEvents.ALERT_CHANGED, [['staff-alerts', staff?.storeId]]);

  if (!staff) return <Loader />;
  const { membership } = staff;
  return (
    <Screen onRefresh={() => void queryClient.invalidateQueries()} refreshing={false}>
      <Row gap={space.md}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <H1 numberOfLines={1}>{name}</H1>
          <Muted numberOfLines={1}>
            {STAFF_ROLE_LABELS[membership.role]} · {DEPARTMENT_LABELS[membership.department]} · {membership.employeeCode}
          </Muted>
        </View>
      </Row>
      {staff.memberships.length > 1 ? (
        <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
          {staff.memberships.map((m) => (
            <Chip key={m.storeId} label={m.storeName} active={m.storeId === staff.storeId} onPress={() => setStore(m.storeId)} />
          ))}
        </Row>
      ) : (
        <View style={{ marginTop: space.md }}>
          <Badge label={`🏪 ${membership.storeName}`} />
        </View>
      )}

      <ClockCard />

      <SectionTitle
        title="My open tasks"
        action={<Button title="All tasks" variant="ghost" size="sm" onPress={() => router.navigate('/staff/tasks')} />}
      />
      <Card style={{ gap: space.md }}>
        {tasks.isLoading ? (
          <Loader />
        ) : (tasks.data ?? []).length === 0 ? (
          <Muted>Nothing assigned to you right now. 🎉</Muted>
        ) : (
          tasks.data!.map((task) => (
            <Row key={task.id} style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                  {task.title}
                </Text>
                <Muted style={{ fontSize: 12 }}>
                  {task.dueAt ? `Due ${formatTime(task.dueAt)}` : 'No deadline'} · from {task.assignedBy.name.split(' ')[0]}
                </Muted>
              </View>
              {task.isOverdue ? (
                <Badge label="Overdue" tone="red" />
              ) : (
                <Badge
                  label={task.status === 'IN_PROGRESS' ? 'In progress' : task.status === 'REOPENED' ? 'Reopened' : 'To do'}
                  tone={task.status === 'REOPENED' ? 'yellow' : 'gray'}
                />
              )}
            </Row>
          ))
        )}
      </Card>

      <SectionTitle
        title="Restock alerts"
        action={<Button title="Open" variant="ghost" size="sm" onPress={() => router.navigate('/staff/alerts')} />}
      />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: (alerts.data?.length ?? 0) > 0 ? colors.warning : colors.brand }}>
              {alerts.data?.length ?? '–'}
            </Text>
            <Muted>shelves below their threshold</Muted>
          </View>
          <Text style={{ fontSize: 34 }}>{(alerts.data?.length ?? 0) > 0 ? '📦' : '✅'}</Text>
        </Row>
      </Card>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Button title="Back to shopping" variant="outline" icon="cart-outline" onPress={() => router.dismissTo('/')} />
        <Button
          title="Sign out of staff mode"
          variant="ghost"
          icon="log-out-outline"
          onPress={() =>
            Alert.alert('Sign out of staff mode?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: async () => {
                  await logout('STAFF');
                  router.dismissTo('/');
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}

/** Clock in with GPS (geofenced to the store) or by scanning the kiosk QR at the staff entrance. */
function ClockCard() {
  const staff = useStaff()!;
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const [scanning, setScanning] = useState(false);
  const { data } = useQuery({ queryKey: ['my-attendance', staff.storeId], queryFn: () => staff.get<MyAttendance>('/attendance/me') });
  useLiveInvalidate(SocketEvents.ATTENDANCE_CHANGED, [['my-attendance', staff.storeId]]);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['my-attendance', staff.storeId] });

  const position = async (): Promise<{ lat?: number; lng?: number }> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return {};
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
    return current ? { lat: current.coords.latitude, lng: current.coords.longitude } : {};
  };

  const clockIn = useMutation({
    mutationFn: async (kioskCode?: string) =>
      staff.post<AttendanceRecord>(
        '/attendance/clock-in',
        kioskCode ? { method: 'KIOSK', kioskCode } : { method: 'APP', ...(await position()) },
      ),
    onSuccess: (record) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(
        `Clocked in at ${formatTime(record.clockInAt)}`,
        record.lateByMinutes > 0 ? `${record.lateByMinutes} min after your shift started` : 'Have a great shift!',
      );
      refresh();
    },
    onError: (error) => toast.error('Could not clock in', errorMessage(error)),
  });
  const clockOut = useMutation({
    mutationFn: async () => staff.post<AttendanceRecord>('/attendance/clock-out', { method: 'APP', ...(await position()) }),
    onSuccess: (record) => {
      toast.success('Clocked out', `You worked ${formatDuration(record.workedMinutes)} today.`);
      refresh();
    },
    onError: (error) => toast.error('Could not clock out', errorMessage(error)),
  });

  const open = data?.open;
  const shift = data?.todayShift;
  const workedSoFar = open ? (now.getTime() - new Date(open.clockInAt).getTime()) / 60_000 : 0;
  return (
    <Card style={{ marginTop: space.lg, gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Muted>My shift today</Muted>
          <H2>{shift ? `${formatTime(shift.startAt)} – ${formatTime(shift.endAt)}` : 'No shift scheduled'}</H2>
          {shift?.label && <Muted style={{ fontSize: 12 }}>{shift.label}</Muted>}
        </View>
        <Badge label={open ? 'On duty' : 'Off duty'} tone={open ? 'green' : 'gray'} />
      </Row>
      {open && (
        <Text style={{ color: colors.text }}>
          In since <Text style={{ fontWeight: '700' }}>{formatTime(open.clockInAt)}</Text> · {formatDuration(workedSoFar)} so far
          {open.lateByMinutes > 0 && <Text style={{ color: colors.warning }}> · {open.lateByMinutes} min late</Text>}
        </Text>
      )}
      {open ? (
        <Button title="Clock out" variant="dark" icon="log-out-outline" loading={clockOut.isPending} onPress={() => clockOut.mutate()} />
      ) : (
        <Row>
          <Button
            title="Clock in here"
            icon="log-in-outline"
            style={{ flex: 1 }}
            loading={clockIn.isPending}
            onPress={() => clockIn.mutate(undefined)}
          />
          <Button title="Kiosk QR" icon="qr-code-outline" variant="outline" style={{ flex: 1 }} onPress={() => setScanning(true)} />
        </Row>
      )}
      <Muted style={{ fontSize: 12 }}>
        This week: {formatDuration(data?.weekMinutes ?? 0)} worked · clock-in checks you are at the store
      </Muted>
      {(data?.upcoming.length ?? 0) > 0 && (
        <View style={{ marginTop: space.sm, gap: 4 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Coming up</Text>
          {data!.upcoming.slice(0, 4).map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <Muted>{formatDate(s.startAt)}</Muted>
              <Text style={{ color: colors.text }}>
                {formatTime(s.startAt)} – {formatTime(s.endAt)}
                {s.label ? ` · ${s.label}` : ''}
              </Text>
            </Row>
          ))}
        </View>
      )}
      <ScannerModal
        visible={scanning}
        onClose={() => setScanning(false)}
        title="Scan the attendance kiosk"
        hint="Point the camera at the QR code on the screen at the staff entrance"
        manualPlaceholder="Or type the code under the QR"
        onScan={(value) => {
          setScanning(false);
          const parsed = parseKioskUri(value);
          clockIn.mutate(parsed?.code ?? value.trim().toUpperCase());
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontWeight: '800', fontSize: 18 },
});
