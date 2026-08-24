import { createHmac, timingSafeEqual } from "node:crypto"
import type { SendResult, WhatsAppProvider } from "./types"

/**
 * Twilio's WhatsApp API.
 *
 * Chosen first because the sandbox works in minutes with no business
 * verification — good enough to prove the whole loop before committing to
 * Meta's onboarding.
 */

/** "whatsapp:+60123456789" → "60123456789" */
function stripChannel(address: string): string {
  return address.replace(/^whatsapp:/, "").replace(/\D/g, "")
}

/**
 * Twilio signs the request URL concatenated with every POST parameter, sorted
 * by key. Getting the URL wrong is the usual failure: behind a tunnel or a
 * proxy, the URL Twilio signed is the public one, not the one the app sees.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  return createHmac("sha1", authToken).update(Buffer.from(payload, "utf8")).digest("base64")
}

export function verifyTwilioSignature(input: {
  authToken: string
  url: string
  params: Record<string, string>
  signature: string | null
}): boolean {
  if (!input.signature) return false

  const expected = twilioSignature(input.authToken, input.url, input.params)
  const a = Buffer.from(expected)
  const b = Buffer.from(input.signature)

  // Length must match before a constant-time compare, and comparing with ===
  // would leak the answer a byte at a time.
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createTwilioProvider(config: {
  accountSid: string
  authToken: string
  /** The sender, e.g. "whatsapp:+14155238886" for the sandbox. */
  from: string
  /** The public URL Twilio posts to, which is what it signed. */
  publicUrl: string
}): WhatsAppProvider {
  return {
    name: "twilio",

    verify({ url, params, headers }) {
      // Prefer the configured public URL: behind a tunnel the request's own URL
      // is localhost, which was not what Twilio signed.
      return verifyTwilioSignature({
        authToken: config.authToken,
        url: config.publicUrl || url,
        params,
        signature: headers.get("x-twilio-signature"),
      })
    },

    parse({ params }) {
      const from = params.From ? stripChannel(params.From) : null
      const body = params.Body?.trim()
      if (!from || !body) return null

      return {
        from,
        displayName: params.ProfileName?.trim() || null,
        body,
        externalId: params.MessageSid ?? null,
      }
    },

    async send({ to, body }): Promise<SendResult> {
      const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: config.from,
            To: to.startsWith("whatsapp:") ? to : `whatsapp:+${to.replace(/\D/g, "")}`,
            Body: body,
          }),
        }
      )

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Twilio rejected the message (${response.status}): ${text.slice(0, 300)}`)
      }

      const payload = JSON.parse(text) as { sid?: string }
      return { externalId: payload.sid ?? null }
    },
  }
}
