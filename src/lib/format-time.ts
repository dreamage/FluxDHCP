/**
 * Format a datetime string from the database (UTC, no timezone info) to local time.
 * SQLite's datetime('now') returns UTC without 'Z', so we append it for correct parsing.
 */
export function formatLocalTime(v: string | null | undefined): string {
  if (!v) return '-';
  // If already has timezone info, parse directly
  if (v.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(v)) {
    return new Date(v).toLocaleString();
  }
  return new Date(v + 'Z').toLocaleString();
}
