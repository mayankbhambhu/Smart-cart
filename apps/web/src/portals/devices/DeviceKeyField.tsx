import { KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Paste the API key the device was issued in Store OS (or a seeded demo key). */
export function DeviceKeyField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error: string | null }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft.trim());
      }}
    >
      <KeyRound className={cn('size-4', error ? 'text-rose-400' : 'text-white/40')} />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Device API key"
        className="h-9 w-72 border-white/10 bg-white/10 font-mono text-xs text-white placeholder:text-white/40"
      />
      <Button type="submit" size="sm" variant="secondary">
        Connect
      </Button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </form>
  );
}
