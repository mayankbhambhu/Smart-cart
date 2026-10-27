import { formatDuration, parseKioskUri, type AttendanceRecord, type MyAttendance } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, QrCode } from 'lucide-react';
import { useState } from 'react';
import { ScannerModal } from '@/components/Scanner';
import { Badge, Button, Card } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn, formatTime, useNow } from '@/lib/utils';
import { useOps } from './hooks';

export { PriorityBadge, RequestStatusBadge, TaskStatusBadge, TicketStatusBadge } from '@/components/status';
export { PageHeader } from '@/components/ui';

/** Shelf vs storage stock with the reorder threshold marked. */
export function StockBar({ shelf, storage, threshold, target }: { shelf: number; storage: number; threshold: number; target: number }) {
  const max = Math.max(target, shelf, threshold + 1, 1);
  const pct = Math.min(100, (shelf / max) * 100);
  const low = shelf <= threshold;
  return (
    <div className="w-28">
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', shelf === 0 ? 'bg-rose-500' : low ? 'bg-amber-500' : 'bg-brand-500')}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute top-0 h-full w-0.5 bg-slate-500/60" style={{ left: `${Math.min(100, (threshold / max) * 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        <span className={cn('font-bold', shelf === 0 ? 'text-rose-600' : low ? 'text-amber-700' : 'text-slate-800')}>{shelf}</span> shelf ·{' '}
        {storage} storage
      </p>
    </div>
  );
}

/** Clock in / out for the signed-in employee: GPS (geofenced) or the kiosk QR at the staff entrance. */
export function ClockCard({ className }: { className?: string }) {
  const ops = useOps();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const [scanning, setScanning] = useState(false);
  const { data } = useQuery({ queryKey: ['my-attendance', ops.storeId], queryFn: () => ops.get<MyAttendance>('/attendance/me') });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-attendance', ops.storeId] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-board', ops.storeId] });
  };

  const position = () =>
    new Promise<{ lat?: number; lng?: number }>((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 6000, maximumAge: 60_000 },
      );
    });

  const clockIn = useMutation({
    mutationFn: async (kioskCode?: string) =>
      ops.post<AttendanceRecord>(
        '/attendance/clock-in',
        kioskCode ? { method: 'KIOSK', kioskCode } : { method: 'APP', ...(await position()) },
      ),
    onSuccess: (record) => {
      toast.success(
        `Clocked in at ${formatTime(record.clockInAt)}`,
        record.lateByMinutes > 0 ? `${record.lateByMinutes} min after your shift started` : 'Have a great shift!',
      );
      refresh();
    },
    onError: (error) => toast.error('Could not clock in', errorMessage(error)),
  });
  const clockOut = useMutation({
    mutationFn: () => ops.post<AttendanceRecord>('/attendance/clock-out', { method: 'APP' }),
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
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">My shift today</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {shift ? `${formatTime(shift.startAt)} – ${formatTime(shift.endAt)}` : 'No shift scheduled'}
          </p>
          {shift?.label && <p className="text-xs text-slate-500">{shift.label}</p>}
        </div>
        <Badge tone={open ? 'green' : 'gray'}>{open ? 'On duty' : 'Off duty'}</Badge>
      </div>
      {open && (
        <p className="mt-3 text-sm text-slate-600">
          In since <strong>{formatTime(open.clockInAt)}</strong> · {formatDuration(workedSoFar)} so far
          {open.lateByMinutes > 0 && <span className="text-amber-700"> · {open.lateByMinutes} min late</span>}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {open ? (
          <Button variant="dark" icon={<LogOut className="size-4" />} loading={clockOut.isPending} onClick={() => clockOut.mutate()}>
            Clock out
          </Button>
        ) : (
          <>
            <Button icon={<LogIn className="size-4" />} loading={clockIn.isPending} onClick={() => clockIn.mutate(undefined)}>
              Clock in here
            </Button>
            <Button variant="outline" icon={<QrCode className="size-4" />} onClick={() => setScanning(true)}>
              Scan kiosk QR
            </Button>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">This week: {formatDuration(data?.weekMinutes ?? 0)} worked</p>
      <ScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan the attendance kiosk"
        hint="Point the camera at the QR code on the screen at the staff entrance"
        manualPlaceholder="Or type the code shown under the QR"
        onScan={(value) => {
          setScanning(false);
          const parsed = parseKioskUri(value);
          clockIn.mutate(parsed?.code ?? value.trim().toUpperCase());
        }}
      />
    </Card>
  );
}
