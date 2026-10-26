/**
 * Timezone helpers built on Intl (no external dependency). Stores operate in
 * their local timezone: shifts, pickup slots and daily reports are all
 * expressed in store-local dates and times.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ZonedParts {
  date: string;
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  dow: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
    dow: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (IST = +330). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Converts a store-local date + "HH:mm" to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMinutes(new Date(guess), timeZone);
  let result = guess - first * 60_000;
  const second = offsetMinutes(new Date(result), timeZone);
  if (second !== first) result = guess - second * 60_000;
  return new Date(result);
}

/** Store-local calendar date of an instant. */
export function zonedDate(instant: Date, timeZone: string): string {
  return zonedParts(instant, timeZone).date;
}

export function startOfZonedDay(date: string, timeZone: string): Date {
  return zonedToUtc(date, '00:00', timeZone);
}

/** Half-open UTC range [start, end) covering store-local dates from..to inclusive. */
export function zonedRange(from: string, to: string, timeZone: string): { start: Date; end: Date } {
  return { start: startOfZonedDay(from, timeZone), end: startOfZonedDay(addDays(to, 1), timeZone) };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export function minutesOfDay(time: string): number {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return hh * 60 + mm;
}

/** Is the store open at `instant`? Handles closing times after midnight. */
export function isOpenAt(instant: Date, timeZone: string, opening: string, closing: string): boolean {
  const now = minutesOfDay(zonedParts(instant, timeZone).time);
  const open = minutesOfDay(opening);
  const close = minutesOfDay(closing);
  if (open === close) return true;
  return open < close ? now >= open && now < close : now >= open || now < close;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
