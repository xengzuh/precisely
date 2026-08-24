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

/**
 * Forward banners printed by the common clients.
 *
 * Outlook frequently prints none at all — just a bare From:/Sent:/To:/Subject:
 * block that is structurally identical to its reply header. That case is
 * caught by the subject line instead.
 */
const FORWARD_BANNERS: RegExp[] = [
  /^[ \t]*-{2,}[ \t]*Forwarded message[ \t]*-{2,}[ \t]*$/im,
  /^[ \t]*-{2,}[ \t]*Forwarded Message[ \t]*-{2,}[ \t]*$/im,
  /^[ \t]*Begin forwarded message:[ \t]*$/im,
]

/** "FW: PO 4471", "Fwd: ...". A leading RE: means the last action was a reply. */
const FORWARD_SUBJECT = /^\s*(fw|fwd)\s*:/i
const REPLY_SUBJECT = /^\s*re\s*:/i

const HEADER_LINE = /^[ \t]*(From|Sent|Date|To|Cc|Bcc|Subject|Reply-To)[ \t]*:/i

/**
 * Locate the header block a client writes when quoting a message, and read the
 * original sender and subject out of it.
 *
 * Line-based rather than one large regex because the shape varies by client
 * and a wrong match here silently attributes an order to the wrong company.
 */
function findForwardedHeaders(
  lines: string[],
  searchFrom = 0
): { start: number; bodyStart: number; from: string | null; subject: string | null } | null {
  for (let i = searchFrom; i < lines.length; i++) {
    if (!/^[ \t]*From[ \t]*:/i.test(lines[i])) continue

    // A lone "From:" proves nothing — a person can write it. A following
    // Sent/Date/Subject line is what makes it a quoted header block.
    const lookahead = lines.slice(i + 1, i + 7)
    if (!lookahead.some((l) => /^[ \t]*(Sent|Date|Subject)[ \t]*:/i.test(l))) continue

    let end = i
    while (end < lines.length && (HEADER_LINE.test(lines[end]) || /^[ \t]+\S/.test(lines[end]))) {
      end++
    }

    const block = lines.slice(i, end)
    const fromLine = block.find((l) => /^[ \t]*From[ \t]*:/i.test(l))
    const subjectLine = block.find((l) => /^[ \t]*Subject[ \t]*:/i.test(l))

    let bodyStart = end
    while (bodyStart < lines.length && lines[bodyStart].trim() === "") bodyStart++

    return {
      start: i,
      bodyStart,
      from: parseEmailAddress(fromLine?.replace(/^[ \t]*From[ \t]*:/i, "") ?? null),
      subject: subjectLine?.replace(/^[ \t]*Subject[ \t]*:/i, "").trim() || null,
    }
  }

  return null
}

export type MessageKind = "direct" | "reply" | "forward"

export type ParsedBody = {
  /** What the extractor should read. */
  content: string
  /** The original sender when this is a forward — the customer, not whoever forwarded it. */
  forwardedFrom: string | null
  /** The original subject, which usually carries the PO number. */
  forwardedSubject: string | null
  kind: MessageKind
}

/**
 * Work out what part of a message is the order.
 *
 * The same marker means opposite things depending on the message: below
 * "----- Original Message -----" on a reply is history to discard, while below
 * "---------- Forwarded message ---------" is the order itself. Treating them
 * alike — as this originally did — silently throws away every forwarded order.
 *
 * Forwarding is the intended way to hand this system an order, because the act
 * of forwarding is a human saying "this one is real", which is triage no
 * classifier does as well.
 */
export function parseMessageBody(
  body: string | null | undefined,
  subject?: string | null
): ParsedBody {
  const normalized = (body ?? "").replace(/\r\n/g, "\n")
  if (!normalized.trim()) {
    return { content: "", forwardedFrom: null, forwardedSubject: null, kind: "direct" }
  }

  const banner = FORWARD_BANNERS.map((re) => re.exec(normalized))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => a.index - b.index)[0]

  const subjectSaysForward = FORWARD_SUBJECT.test(subject ?? "")

  if (banner || subjectSaysForward) {
    const searchIn = banner ? normalized.slice(banner.index + banner[0].length) : normalized
    const lines = searchIn.split("\n")
    const headers = findForwardedHeaders(lines)

    const payload = headers ? lines.slice(headers.bodyStart).join("\n") : searchIn

    // A forwarded thread can still carry its own quoted history below the
    // order. Fall back rather than return nothing if that strips too hard.
    const inner = stripQuotedReply(payload)
    const content = inner.trim() || payload.trim() || normalized.trim()

    return {
      content,
      // With no parsed sender, report none. The envelope From on a forward is
      // whoever forwarded it — attributing an order to your own staff member
      // is worse than attributing it to nobody.
      forwardedFrom: headers?.from ?? null,
      forwardedSubject: headers?.subject ?? null,
      kind: "forward",
    }
  }

  return {
    content: stripQuotedReply(normalized),
    forwardedFrom: null,
    forwardedSubject: null,
    kind: REPLY_SUBJECT.test(subject ?? "") ? "reply" : "direct",
  }
}
