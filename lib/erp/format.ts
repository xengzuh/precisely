/**
 * Display formatting for money and dates.
 *
 * Currency and locale come from the organization, not from a constant — the
 * app is single-country today but the schema is not, and hard-coding "RM" at
 * every call site is how that stops being fixable.
 */

export type OrgFormat = {
  currency: string
  locale: string
}

export function formatMoney(amount: number, org: OrgFormat): string {
  return new Intl.NumberFormat(org.locale, {
    style: "currency",
    currency: org.currency,
  }).format(amount)
}

/** Date-only values (`issue_date`, `due_date`) are stored as `YYYY-MM-DD`. */
export function formatDate(value: string | null, org: OrgFormat): string {
  if (!value) return "—"
  // Parse as UTC. `new Date("2026-08-12")` is already UTC midnight, but
  // `new Date("2026-08-12T00:00:00")` is local — normalising here keeps a date
  // from sliding a day backwards for anyone west of Greenwich.
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return new Intl.DateTimeFormat(org.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

/** Days until a due date; negative once it has passed. */
export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime()
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()
  return Math.round((due - today) / 86_400_000)
}
