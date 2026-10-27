import { useEffect, useState } from 'react';
import { extendTailwindMerge } from 'tailwind-merge';

// Know the custom shadow tokens from styles.css so `shadow-card` and `shadow-pop` override each other.
const twMerge = extendTailwindMerge({ extend: { theme: { shadow: ['card', 'pop'] } } });

/** Joins class names; later Tailwind utilities win over conflicting earlier ones (`w-full` + `w-48` → `w-48`). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Re-renders every `interval` ms (countdowns, "x minutes ago"). */
export function useNow(interval = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

const IST = 'Asia/Kolkata';

export function formatTime(iso: string | null | undefined, timeZone = IST): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });
}

export function formatDate(iso: string | null | undefined, options: Intl.DateTimeFormatOptions = {}, timeZone = IST): string {
  if (!iso) return '—';
  const value = iso.length === 10 ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso);
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone, ...options });
}

export function formatDateTime(iso: string | null | undefined, timeZone = IST): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone });
}

/** Today's date in the store timezone as YYYY-MM-DD. */
export function localDate(offsetDays = 0, timeZone = IST): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return parts;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function startOfWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function rupeesToPaise(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function paiseToRupees(value: number): string {
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard?.writeText(text) ?? Promise.resolve();
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "HH:mm" (24h) in the store timezone, for time inputs. */
export function timeOfDay(iso: string, timeZone = IST): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
}

/** A local date + "HH:mm" in the store timezone (IST, no DST) as an ISO timestamp. */
export function zonedIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}
