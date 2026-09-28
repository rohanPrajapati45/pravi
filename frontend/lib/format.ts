export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Indian convention: lakh / crore.
export function formatRupees(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function formatChainage(start: number | null | undefined, end: number | null | undefined) {
  if (start == null || end == null) return null;
  return `km ${Number(start).toFixed(3)}–${Number(end).toFixed(3)}`;
}

export function daysFromToday(value: string | null | undefined) {
  if (!value) return null;
  const target = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  const today = new Date(new Date().toDateString());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
