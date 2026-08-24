import { createMetaProvider } from "./meta"
import { createTwilioProvider } from "./twilio"
import type { WhatsAppProvider } from "./types"

export type { IncomingMessage, SendResult, WhatsAppProvider } from "./types"

/**
 * The configured provider, or null when none is set up.
 *
 * Null is a supported state, not a failure: the review inbox works without a
 * channel — drafts are approved and copied into WhatsApp by hand — so the app
 * must stay useful before any of this is configured.
 */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  // Meta first: it is the direct route, so a configured Cloud API wins over a
  // half-configured reseller left over from testing.
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (phoneNumberId && accessToken && appSecret && verifyToken) {
    return createMetaProvider({ phoneNumberId, accessToken, appSecret, verifyToken })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const publicUrl = process.env.WHATSAPP_PUBLIC_URL

  if (accountSid && authToken && from) {
    return createTwilioProvider({ accountSid, authToken, from, publicUrl: publicUrl ?? "" })
  }

  return null
}

export function whatsappConfigured(): boolean {
  return getWhatsAppProvider() !== null
}
