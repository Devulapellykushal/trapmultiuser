/**
 * Format instants in Asia/Kolkata (IST) for display.
 * Uses 12-hour clock with literal "am" / "pm".
 */
export function formatDateTimeIST(iso?: string | null): string {
  if (!iso || !String(iso).trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  let day = "";
  let month = "";
  let year = "";
  let hour = "";
  let minute = "";
  let dayPeriod = "";

  for (const p of parts) {
    if (p.type === "day") day = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "year") year = p.value;
    else if (p.type === "hour") hour = p.value;
    else if (p.type === "minute") minute = p.value;
    else if (p.type === "dayPeriod") dayPeriod = p.value.toLowerCase();
  }

  const clock = `${hour}:${minute}${dayPeriod}`;
  return `${day} ${month} ${year}, ${clock}`;
}
