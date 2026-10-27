import { SocketEvents, type AttendanceBoard, type KioskCode } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Maximize } from 'lucide-react';
import { useEffect } from 'react';
import { Logo } from '@/components/brand';
import { QRCode } from '@/components/codes';
import { EmptyState } from '@/components/ui';
import { useSession } from '@/lib/auth';
import { formatTime, useNow } from '@/lib/utils';
import { useLiveInvalidate, useOps, useStoreRoom } from './hooks';

/**
 * Attendance kiosk for a tablet at the staff entrance. The QR rotates every
 * minute (HMAC of the store secret and the time window), so it only
 * works for someone standing in front of it.
 */
export default function KioskPage() {
  const session = useSession('STAFF');
  if (!session || session.memberships.length === 0) return <EmptyState icon="🏬" title="No store assigned" />;
  return <Kiosk />;
}

function Kiosk() {
  const ops = useOps();
  const now = useNow(1000);
  useStoreRoom(ops.storeId);
  const { data: code, refetch } = useQuery({
    queryKey: ['kiosk-code', ops.storeId],
    queryFn: () => ops.get<KioskCode>('/attendance/kiosk-code'),
    enabled: ops.isLeadership,
  });
  const { data: board } = useQuery({
    queryKey: ['attendance-board', ops.storeId],
    queryFn: () => ops.get<AttendanceBoard>('/attendance/board'),
    refetchInterval: 60_000,
  });
  useLiveInvalidate([SocketEvents.ATTENDANCE_CHANGED], [['attendance-board', ops.storeId]], 500);

  useEffect(() => {
    if (!code) return;
    const ms = Math.max(1000, new Date(code.expiresAt).getTime() - Date.now() + 200);
    const timer = setTimeout(() => void refetch(), ms);
    return () => clearTimeout(timer);
  }, [code, refetch]);

  if (!ops.isLeadership) return <EmptyState icon="🔒" title="Only the store manager or owner can open the kiosk" />;
  const secondsLeft = code ? Math.max(0, Math.round((new Date(code.expiresAt).getTime() - now.getTime()) / 1000)) : 0;
  const recent = [...(board?.onDuty ?? []), ...(board?.completed ?? [])].sort((a, b) => b.clockInAt.localeCompare(a.clockInAt)).slice(0, 8);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between px-8 py-6">
        <Logo dark subtitle={ops.membership.storeName} />
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
        >
          <Maximize className="size-4" /> Full screen
        </button>
      </header>
      <main className="grid flex-1 items-center gap-10 px-8 pb-10 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <p className="text-7xl font-extrabold tracking-tight tabular-nums sm:text-8xl">
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
          </p>
          <p className="mt-2 text-xl text-white/60">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}
          </p>
          <div className="mt-10 space-y-3 text-lg text-white/80">
            <p>1. Open the SmartCart Staff app</p>
            <p>2. Tap “Clock in” → “Scan kiosk QR”</p>
            <p>3. Point your camera at this code</p>
          </div>
          {recent.length > 0 && (
            <div className="mt-10">
              <p className="text-sm font-semibold tracking-wider text-white/40 uppercase">Today</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
                    <span className="font-semibold">{r.employee.name}</span>
                    <span className="text-white/60">
                      {formatTime(r.clockInAt)}
                      {r.clockOutAt ? ` – ${formatTime(r.clockOutAt)}` : ' · in'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center">
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            {code ? (
              <QRCode value={code.uri} size={340} label="Attendance kiosk QR" />
            ) : (
              <div className="size-[340px] animate-pulse rounded-xl bg-slate-200" />
            )}
          </div>
          {code && (
            <>
              <p className="mt-6 font-mono text-4xl font-extrabold tracking-[0.35em]">{code.code}</p>
              <div className="mt-4 h-1.5 w-72 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, (secondsLeft / 60) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-white/50">New code in {secondsLeft}s</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
