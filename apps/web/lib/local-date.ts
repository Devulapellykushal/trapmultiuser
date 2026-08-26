/**
 * Local calendar helpers for POS / dashboard "today".
 * Never use toISOString().split("T")[0] — that is UTC and breaks IST mornings.
 */

/** YYYY-MM-DD in the browser's local timezone */
export function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of local calendar day */
export function startOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** End of local calendar day */
export function endOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
