import type { UnavailableRange } from "./types";

const MS_PER_DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return startOfDay(new Date(y, (m || 1) - 1, d || 1));
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/** Generate every day from `start` inclusive for `count` days. */
export function generateDays(start: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(start, i));
  return out;
}

/** Returns true if the date falls within any of the unavailable ranges. */
export function isUnavailable(date: Date, ranges: UnavailableRange[]): boolean {
  const t = startOfDay(date).getTime();
  for (const r of ranges) {
    const s = parseYmd(r.start_date).getTime();
    const e = parseYmd(r.end_date).getTime();
    if (t >= Math.min(s, e) && t <= Math.max(s, e)) return true;
  }
  return false;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shortMonth(d: Date): string {
  return MONTHS[d.getMonth()];
}

export function weekday(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

export function prettyDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
