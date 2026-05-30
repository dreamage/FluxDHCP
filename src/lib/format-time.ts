/**
 * Format a datetime string from the database (UTC) to local time with milliseconds.
 * Supports both old format (YYYY-MM-DD HH:MM:SS) and new ISO format (YYYY-MM-DDTHH:MM:SS.sssZ).
 */
export function formatLocalTime(v: string | null | undefined): string {
  if (!v) return '-';
  let date: Date;
  if (v.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(v)) {
    date = new Date(v);
  } else {
    // Old format without timezone: treat as UTC
    date = new Date(v + 'Z');
  }
  // Format with milliseconds
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
}
