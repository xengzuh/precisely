import { createHmac, timingSafeEqual } from "node:crypto"
import type { IncomingMessage, SendResult, WhatsAppProvider } from "./types"

/**
 * WhatsApp Cloud API — Meta, direct.
 *
 * No reseller in between, which is both cheaper and one less vendor to trust
 * with customer conversations. Meta signs the raw request body with the app
 * secret, and expects a one-time GET handshake before it will save a webhook.
 */

/** Graph API version. Overridable so a sunset version is a config change. */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v21.0"

type MetaWebhookBody = {
  object?: string
  entry?: {
    changes?: {
      field?: string
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: {
          from?: string
          id?: string
          type?: string
          text?: { body?: string }
        }[]
        // Delivery and read receipts arrive on the same webhook as messages.
        statuses?: unknown[]
      }
    }[]
  }[]
}

export function verifyMetaSignature(input: {
  appSecret: string
  rawBody: string
  header: string | null
}): boolean {
  if (!input.header) return false

  const provided = input.header.startsWith("sha256=") ? input.header.slice(7) : input.header
  const expected = createHmac("sha256", input.appSecret).update(input.rawBody, "utf8").digest("hex")

  // Length first: timingSafeEqual throws on a mismatch, and === would leak the
  // answer a byte at a time.
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
}

/**
 * The GET handshake Meta performs before saving a webhook. Echo the challenge
 * back verbatim when the token matches, and refuse otherwise — this is the
 * only thing stopping someone else pointing their app at your endpoint.
 */
export function handleVerification(input: {
  verifyToken: string
  params: URLSearchParams
}): { ok: true; challenge: string } | { ok: false } {
  const mode = input.params.get("hub.mode")
  const token = input.params.get("hub.verify_token")
  const challenge = input.params.get("hub.challenge")

  if (mode === "subscribe" && token === input.verifyToken && challenge) {
    return { ok: true, challenge }
  }
  return { ok: false }
}

export function parseMetaMessage(rawBody: string): IncomingMessage | null {
  let payload: MetaWebhookBody
  try {
    payload = JSON.parse(rawBody) as MetaWebhookBody
  } catch {
    return null
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      // Status callbacks (delivered, read) ride the same webhook. They carry no
      // message, and treating them as one would draft replies to nothing.
      if (!value?.messages?.length) continue

      const message = value.messages[0]
      // Images, audio, documents and location arrive with no text body. They
      // need a person rather than a silent failure, so report nothing here and
      // let the caller decide.
      if (message.type !== "text") continue

      const body = message.text?.body?.trim()
      const from = message.from?.replace(/\D/g, "")
      if (!body || !from) continue

      return {
        from,
        displayName: value.contacts?.[0]?.profile?.name?.trim() || null,
        body,
        externalId: message.id ?? null,
      }
    }
  }

  return null
}

export function createMetaProvider(config: {
  phoneNumberId: string
  accessToken: string
  appSecret: string
  verifyToken: string
}): WhatsAppProvider & {
  verifyChallenge(params: URLSearchParams): { ok: true; challenge: string } | { ok: false }
} {
  return {
    name: "meta",

    verify({ rawBody, headers }) {
      return verifyMetaSignature({
        appSecret: config.appSecret,
        rawBody,
        header: headers.get("x-hub-signature-256"),
      })
    },

    verifyChallenge(params) {
      return handleVerification({ verifyToken: config.verifyToken, params })
    },

    parse({ rawBody }) {
      return parseMetaMessage(rawBody)
    },

    async send({ to, body }): Promise<SendResult> {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to.replace(/\D/g, ""),
            type: "text",
            text: { preview_url: false, body },
          }),
        }
      )

      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Meta rejected the message (${response.status}): ${text.slice(0, 300)}`)
      }

      const payload = JSON.parse(text) as { messages?: { id?: string }[] }
      return { externalId: payload.messages?.[0]?.id ?? null }
    },
  }
}
