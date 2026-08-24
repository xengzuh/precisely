/**
 * Matching a WhatsApp contact to a customer on file.
 *
 * The same person is "+60 12-345 6789" in your records, "0123456789" on their
 * business card, and "60123456789" as a WhatsApp id. Comparing those as strings
 * never matches, so an existing customer looks like a stranger and none of
 * their learned aliases or terms apply.
 */

/** Digits only, with a leading 0 dropped — "012 345 6789" becomes "123456789". */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 7) return null
  return digits.replace(/^0+/, "")
}

/**
 * The trailing digits that identify a subscriber regardless of how the country
 * code was written. Nine is long enough to be specific and short enough to
 * survive a missing or duplicated prefix.
 */
const SIGNIFICANT = 9

export function phoneKey(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw)
  if (!normalized) return null
  return normalized.slice(-SIGNIFICANT)
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a)
  const kb = phoneKey(b)
  return ka !== null && ka === kb
}
