/**
 * Turning a real email into something worth reading.
 *
 * Everything here is a pure function over the message text, deliberately: this
 * is the layer where a mistake silently changes which order gets created, so
 * it is the layer that most needs to be testable without a mail server.
 */

/**
 * Pull the address out of a From header.
 *
 * Headers arrive as `foo@bar.com`, `Foo Bar <foo@bar.com>`, or
 * `"Bar, Foo" <foo@bar.com>` depending on the sender's client. Matching a
 * customer on the raw header fails on two of those three.
 */
export function parseEmailAddress(header: string | null | undefined): string | null {
  if (!header) return null

  // Angle brackets win when present — the display name may itself contain
  // something that looks like an address.
  const bracketed = header.match(/<([^<>]+)>/)
  const candidate = (bracketed ? bracketed[1] : header).trim().replace(/^["']|["']$/g, "")

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate.toLowerCase() : null
}

export function emailDomain(address: string | null): string | null {
  if (!address) return null
  const at = address.lastIndexOf("@")
  return at === -1 ? null : address.slice(at + 1).toLowerCase()
}

/**
 * Domains where a shared domain says nothing about who the sender is. Matching
 * a customer on "gmail.com" would attach one buyer's order to another's account.
 */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.my",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "qq.com",
  "163.com",
  "aol.com",
])

export function isFreemailDomain(domain: string | null): boolean {
  return domain !== null && FREEMAIL_DOMAINS.has(domain)
}

/**
 * Markers that begin quoted history. Ordered by nothing in particular — the
 * earliest match in the body is the one that counts.
 */
const QUOTE_MARKERS: RegExp[] = [
  // Gmail, Apple Mail: "On Wed, 12 Aug 2026 at 09:14, Foo Bar <x@y> wrote:"
  /^\s*On .{0,200}\bwrote:\s*$/im,
  // Outlook, English and the common localisations
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{10,}\s*$/m,
  // Outlook header block that opens a forward
  /^\s*From:.*$\n^\s*Sent:.*$/im,
  /^\s*From:.*$\n^\s*Date:.*$/im,
  // Forwarded-message banner
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  // A run of quoted lines. Written as "a > line followed by more > lines"
  // rather than a repeated "> line + newline", because the last line of a
  // message has no trailing newline and would not otherwise count.
  /^>.*(\n>.*)+/m,
]

/** RFC 3676 signature delimiter — "-- " alone on a line. */
const SIGNATURE = /^-- $/m

/**
 * Drop quoted history and the sender's signature.
 *
 * The reason this matters is correctness, not tokens: a reply thread carries
 * every previous order underneath the new one, and an extractor handed the
 * whole thing can confidently pull last month's PO instead of today's.
 *
 * The guard at the end is as important as the stripping. A forwarded order
 * with no covering note is *entirely* quoted text — cutting it to nothing
 * would throw the order away, so a strip that leaves nothing meaningful is
 * discarded and the original returned.
 */
export function stripQuotedReply(body: string | null | undefined): string {
  if (!body) return ""

  const normalized = body.replace(/\r\n/g, "\n")

  let cut = normalized.length
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(normalized)
    if (match?.index !== undefined && match.index < cut) cut = match.index
  }

  let head = normalized.slice(0, cut)

  const signature = SIGNATURE.exec(head)
  if (signature?.index !== undefined) head = head.slice(0, signature.index)

  const trimmed = head.trim()

  // Fewer than ~20 meaningful characters means we almost certainly cut the
  // order itself away — a bare "FYI" above a forwarded PO, or a marker that
  // matched at position zero.
  return trimmed.replace(/\s/g, "").length < 20 ? normalized.trim() : trimmed
}

/**
 * Decide whether an attachment is plausibly the order.
 *
 * Real orders arrive alongside signature logos, ISO certificates, and the
 * customer's own terms. Sending all of them to a model costs image tokens per
 * page and buys nothing.
 */
export function isLikelyOrderAttachment(attachment: {
  contentType?: string | null
  contentId?: string | null
  size?: number | null
  name?: string | null
}): boolean {
  if (attachment.contentType !== "application/pdf") return false
  // A Content-ID means the part is referenced inline by the HTML body — that
  // is a signature image, not a document someone attached.
  if (attachment.contentId) return false
  // Below ~10 KB a PDF is a logo or a spacer, not a purchase order.
  if (attachment.size !== null && attachment.size !== undefined && attachment.size < 10_000) {
    return false
  }
  return true
}
