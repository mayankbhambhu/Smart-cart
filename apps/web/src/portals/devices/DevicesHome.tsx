import { DEVICE_TYPE_LABELS, type DeviceType, type StoreSummary } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, QrCode, ShoppingCart } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Card, Select } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { demoKey } from './device';

const DEVICES: { type: DeviceType; to: string; icon: ReactNode; body: string }[] = [
  {
    type: 'EXIT_GATE',
    to: '/devices/gate',
    icon: <DoorOpen className="size-6" />,
    body: 'Scans the digital receipt on the shopper’s phone, checks the payment with SmartCart and opens. Each pass works once.',
  },
  {
    type: 'SMART_CART',
    to: '/devices/cart',
    icon: <ShoppingCart className="size-6" />,
    body: 'A trolley with a barcode reader. Pair it with the code in the shopper’s app; items dropped in appear in their cart and leave store inventory instantly.',
  },
];

/** Browser simulators for the store hardware, for demos and testing without real devices. */
export default function DevicesHome() {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: () => publicApi.get<StoreSummary[]>('/stores') });
  const [storeCode, setStoreCode] = useState('');
  const code = storeCode || stores[0]?.code || '';
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Logo dark subtitle="Device simulators" />
        <h1 className="mt-8 text-3xl font-extrabold">Store hardware, in your browser</h1>
        <p className="mt-2 max-w-2xl text-white/60">
          Use these screens as the exit gate or a smart cart while you shop with the app in another tab or on your phone. Real devices call
          the same API with their own key.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <span className="text-sm text-white/60">Store</span>
          <Select
            value={code}
            onChange={(e) => setStoreCode(e.target.value)}
            className="w-72 border-white/10 bg-white/10 text-white [&>option]:text-slate-900"
            aria-label="Store"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {DEVICES.map((d) => (
            <Card key={d.type} className="border-white/10 bg-white/5 p-6 text-white">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600">{d.icon}</span>
              <p className="mt-4 text-lg font-bold">{DEVICE_TYPE_LABELS[d.type]}</p>
              <p className="mt-1 text-sm text-white/60">{d.body}</p>
              <Link to={`${d.to}?key=${encodeURIComponent(demoKey(code, d.type))}`}>
                <Button className="mt-5" variant="accent" disabled={!code}>
                  Open {DEVICE_TYPE_LABELS[d.type].toLowerCase()}
                </Button>
              </Link>
              <p className="mt-3 font-mono text-[11px] text-white/40">{code && demoKey(code, d.type)}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-5 flex flex-wrap items-center gap-4 border-white/10 bg-white/5 p-6 text-white">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600">
            <QrCode className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">Attendance kiosk</p>
            <p className="text-sm text-white/60">
              Shows the rotating clock-in QR at the staff entrance. Open it from Store OS (manager login).
            </p>
          </div>
          <Link to="/ops/kiosk">
            <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
              Open kiosk
            </Button>
          </Link>
        </Card>
        <p className="mt-6 text-xs text-white/40">
          Demo keys exist only in seeded development databases. Create real keys in Store OS → Store settings → Gates, carts &amp; kiosks.
        </p>
      </div>
    </div>
  );
}
