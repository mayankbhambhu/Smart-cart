import { formatMoney, pluralize, type GateVerifyResult } from '@smartcart/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { ScannerModal } from '@/components/Scanner';
import { Button, Card, Input } from '@/components/ui';
import { deviceClient, errorMessage } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import { DeviceKeyField } from './DeviceKeyField';
import { useDevice, useDeviceKey } from './device';

interface LogEntry extends GateVerifyResult {
  at: string;
}

/**
 * Exit gate simulator. The gate reads the QR / barcode on the shopper's
 * digital receipt, asks SmartCart whether it is paid and unused, and opens.
 */
export default function GateSimulator() {
  const [params] = useSearchParams();
  const { key, setKey } = useDeviceKey('EXIT_GATE', params);
  const { data: device, error: deviceError } = useDevice(key);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<GateVerifyResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verify = useMutation({
    mutationFn: (value: string) => deviceClient(key).post<GateVerifyResult>('/devices/gate/verify', { code: value }),
    onSuccess: (r) => {
      setResult(r);
      setLog((l) => [{ ...r, at: new Date().toISOString() }, ...l].slice(0, 12));
      setCode('');
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResult(null), r.open ? 5000 : 7000);
    },
  });
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const open = result?.open === true;
  const denied = result?.open === false;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <Link to="/devices">
          <Logo dark subtitle={device ? `${device.name} · ${device.storeName}` : 'Exit gate'} />
        </Link>
        <DeviceKeyField value={key} onChange={setKey} error={deviceError ? errorMessage(deviceError) : null} />
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-6 pb-10 lg:grid-cols-[1fr_340px]">
        <div>
          <div
            className={cn(
              'relative flex h-80 items-end justify-center overflow-hidden rounded-3xl border-4 transition-colors duration-500',
              open ? 'border-brand-500 bg-brand-950/40' : denied ? 'border-rose-500 bg-rose-950/40' : 'border-white/10 bg-white/5',
            )}
          >
            <div
              className={cn(
                'absolute top-0 bottom-0 left-0 w-1/2 border-r-2 border-white/20 bg-gradient-to-r from-slate-700 to-slate-600 transition-transform duration-700',
                open && '-translate-x-full',
              )}
            />
            <div
              className={cn(
                'absolute top-0 right-0 bottom-0 w-1/2 border-l-2 border-white/20 bg-gradient-to-l from-slate-700 to-slate-600 transition-transform duration-700',
                open && 'translate-x-full',
              )}
            />
            <div className="relative z-10 mb-8 text-center">
              {open ? (
                <>
                  <CheckCircle2 className="mx-auto size-16 text-brand-400" />
                  <p className="mt-2 text-2xl font-extrabold">Thank you, {result?.order?.customerName.split(' ')[0]}!</p>
                  <p className="text-white/70">
                    {pluralize(result?.order?.itemCount ?? 0, 'item')} · {formatMoney(result?.order?.total ?? 0)} paid
                  </p>
                </>
              ) : denied ? (
                <>
                  <XCircle className="mx-auto size-16 text-rose-400" />
                  <p className="mt-2 max-w-sm text-xl font-extrabold">{result?.message}</p>
                  <p className="text-white/60">Please see a staff member</p>
                </>
              ) : (
                <>
                  <ScanLine className="mx-auto size-14 text-white/70" />
                  <p className="mt-2 text-xl font-bold">Scan your SmartCart receipt</p>
                  <p className="text-white/60">Hold the QR code or barcode under the reader</p>
                </>
              )}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
            <Button size="lg" variant="accent" icon={<ScanLine className="size-5" />} onClick={() => setScanning(true)} disabled={!device}>
              Scan with camera
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) verify.mutate(code.trim());
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="…or paste the code from the exit pass"
                className="h-12 border-white/10 bg-white/10 font-mono text-white placeholder:text-white/40"
                disabled={!device}
              />
              <Button type="submit" size="lg" loading={verify.isPending} disabled={!device}>
                Check
              </Button>
            </form>
          </div>
          {verify.error && <p className="mt-3 text-sm text-rose-400">{errorMessage(verify.error)}</p>}
        </div>
        <Card className="border-white/10 bg-white/5 text-white">
          <p className="border-b border-white/10 px-5 py-3 text-sm font-semibold">Gate log</p>
          <ul className="divide-y divide-white/5">
            {log.length === 0 && <li className="px-5 py-6 text-center text-sm text-white/50">No scans yet</li>}
            {log.map((entry, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                {entry.open ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-400" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {entry.open ? `Opened · ${entry.order?.orderNumber}` : entry.reason.replaceAll('_', ' ').toLowerCase()}
                  </p>
                  <p className="truncate text-xs text-white/50">{entry.open ? entry.order?.customerName : entry.message}</p>
                </div>
                <span className="text-xs text-white/40">{formatTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
      <ScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Gate scanner"
        hint="Show the exit pass from the SmartCart app"
        manualPlaceholder="Paste the scanned code"
        onScan={(value) => {
          setScanning(false);
          verify.mutate(value);
        }}
      />
    </div>
  );
}
