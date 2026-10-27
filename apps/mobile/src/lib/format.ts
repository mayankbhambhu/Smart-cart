const IST = 'Asia/Kolkata';

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = iso.length === 10 ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso);
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST });
}
