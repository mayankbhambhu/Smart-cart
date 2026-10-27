import type { Address, AddressLabel } from '@smartcart/shared';
import { useQueryClient } from '@tanstack/react-query';
import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Input, Segmented } from '@/components/ui';
import { ApiError, customerApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useCurrentStore } from './hooks';

/** New delivery address. Coordinates come from the browser, or default to near the selected store. */
export function AddressForm({ onSaved, onCancel }: { onSaved: (address: Address) => void; onCancel?: () => void }) {
  const { store } = useCurrentStore();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState<AddressLabel>('HOME');
  const [form, setForm] = useState({
    line1: '',
    line2: '',
    landmark: '',
    city: store?.city ?? '',
    state: store?.state ?? '',
    pincode: store?.pincode ?? '',
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
          const position = coords ?? { lat: (store?.lat ?? 12.97) + 0.004, lng: (store?.lng ?? 77.64) + 0.003 };
          const saved = await customerApi.post<Address>('/me/addresses', {
            label,
            ...form,
            line2: form.line2 || null,
            landmark: form.landmark || null,
            ...position,
          });
          await queryClient.invalidateQueries({ queryKey: ['addresses'] });
          toast.success('Address saved');
          onSaved(saved);
        } catch (error) {
          if (error instanceof ApiError) setErrors(error.fieldErrors);
          toast.error('Could not save the address', (error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Segmented
        value={label}
        onChange={setLabel}
        options={[
          { value: 'HOME', label: 'Home' },
          { value: 'WORK', label: 'Work' },
          { value: 'OTHER', label: 'Other' },
        ]}
      />
      <Field label="Flat / house no. and building" error={errors.line1}>
        <Input value={form.line1} onChange={set('line1')} placeholder="Flat 302, Lakeview Apartments" />
      </Field>
      <Field label="Street and area" error={errors.line2}>
        <Input value={form.line2} onChange={set('line2')} placeholder="12th Main Road, HAL 2nd Stage" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" error={errors.city}>
          <Input value={form.city} onChange={set('city')} />
        </Field>
        <Field label="State" error={errors.state}>
          <Input value={form.state} onChange={set('state')} />
        </Field>
        <Field label="PIN code" error={errors.pincode}>
          <Input value={form.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
        </Field>
      </div>
      <Field label="Landmark (optional)">
        <Input value={form.landmark} onChange={set('landmark')} placeholder="Opposite the metro station" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<LocateFixed className="size-4" />}
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (pos) => {
                setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                toast.success('Location pinned');
              },
              () => toast.error('Location unavailable'),
            )
          }
        >
          {coords ? 'Location pinned' : 'Pin my current location'}
        </Button>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={busy}>
            Save address
          </Button>
        </div>
      </div>
    </form>
  );
}
