/**
 * The transport boundary.
 *
 * Providers disagree about everything except the idea of a message: Twilio
 * posts form-encoded fields and signs a URL with HMAC-SHA1, Meta posts JSON and
 * signs the raw body with SHA-256. Keeping that behind one interface means the
 * agent, the review inbox, and the audit trail never learn which one is in use.
 */

export type IncomingMessage = {
  /** The sender's address on the channel — for WhatsApp, digits, no plus. */
  from: string
  displayName: string | null
  body: string
  /** The provider's id for this message, used to deduplicate retries. */
  externalId: string | null
}

export type SendResult = {
  externalId: string | null
}

export interface WhatsAppProvider {
  readonly name: string

  /**
   * Verify a webhook came from the provider. Returning false must mean the
   * request is rejected — this is the only thing standing between a public
   * URL and anyone injecting customer messages.
   */
  verify(input: {
    rawBody: string
    headers: Headers
    url: string
    params: Record<string, string>
  }): boolean

  parse(input: { rawBody: string; params: Record<string, string> }): IncomingMessage | null

  send(input: { to: string; body: string }): Promise<SendResult>
}
