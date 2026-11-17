/**
 * Format a Date to a local-time `YYYY-MM-DD` key.
 * Used for file names and day buckets, where a UTC date would be off by one
 * for users east of UTC during the evening hours.
 */
export function formatLocalDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Format a datetime string from the database (UTC) to local time, to the second.
 * Supports both old format (YYYY-MM-DD HH:MM:SS) and new ISO format (YYYY-MM-DDTHH:MM:SS.sssZ).
 *
 * Milliseconds are deliberately dropped: every surface shows the same
 * resolution, so the same event never looks different on two pages.
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
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}
