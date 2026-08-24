import { after } from "next/server"
import { receiveMessage } from "@/lib/ai/agents/conversation"
import { hasApiKey } from "@/lib/ai/client"
import { getAgentContext } from "@/lib/erp/actions/context"
import { getWhatsAppProvider } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Drafting a reply is a model call with catalog lookups — well past the default
// serverless timeout. Twilio gives up at 15 seconds and will retry; the
// Message-ID check makes that harmless.
export const maxDuration = 60

/**
 * Meta's webhook verification handshake.
 *
 * Before saving a callback URL, Meta calls it with a challenge and the verify
 * token you configured. Echoing the challenge back proves you own the endpoint;
 * refusing on a token mismatch stops someone else pointing their app at it.
 */
export async function GET(request: Request) {
  const provider = getWhatsAppProvider()

  if (!provider || !("verifyChallenge" in provider)) {
    return new Response("No provider configured that uses a challenge handshake", { status: 501 })
  }

  const params = new URL(request.url).searchParams
  const result = (
    provider as { verifyChallenge(p: URLSearchParams): { ok: true; challenge: string } | { ok: false } }
  ).verifyChallenge(params)

  if (!result.ok) {
    console.warn("[whatsapp] verification failed — check WHATSAPP_VERIFY_TOKEN matches Meta")
    return new Response("Verification failed", { status: 403 })
  }

  // Plain text, challenge verbatim. Meta rejects anything else.
  return new Response(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

/**
 * Inbound WhatsApp messages.
 *
 * Two things keep this safe on a public URL: the provider's signature is
 * verified before the body is read, and `org_id` comes from server config
 * rather than the payload. This path runs on the service role with no RLS, so
 * an org taken from the request would let any sender write into any tenant.
 */
/** Twilio expects TwiML; Meta expects a bare 200. */
function acknowledge(providerName: string): Response {
  if (providerName === "twilio") {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  }
  return new Response("OK", { status: 200 })
}

export async function POST(request: Request) {
  const provider = getWhatsAppProvider()
  const orgId = process.env.INBOUND_ORG_ID

  if (!provider) {
    return new Response(
      "No WhatsApp provider configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM.",
      { status: 501 }
    )
  }
  if (!orgId) return new Response("INBOUND_ORG_ID is not set", { status: 501 })
  if (!hasApiKey()) return new Response("ANTHROPIC_API_KEY is not set", { status: 501 })

  const rawBody = await request.text()
  // Twilio posts form-encoded; its signature covers the parameters, not the
  // raw body, so both forms are needed.
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (!provider.verify({ rawBody, headers: request.headers, url: request.url, params })) {
    console.warn(
      `[whatsapp] signature rejected (${provider.name}). ` +
        "Check WHATSAPP_APP_SECRET belongs to the app whose webhook is configured."
    )
    return new Response("Invalid signature", { status: 401 })
  }

  const message = provider.parse({ rawBody, params })

  // Delivery receipts, read receipts, and non-text messages all arrive here.
  // They are not failures — acknowledge them so the provider stops retrying.
  //
  // But a real message silently ignored looks identical to a receipt from the
  // outside, so say which it was. A webhook that drops messages quietly is the
  // hardest kind of bug to notice.
  if (!message) {
    console.warn(`[whatsapp] nothing to process. Raw payload:`, rawBody.slice(0, 1200))
    return acknowledge(provider.name)
  }

  console.log(
    `[whatsapp] message from ${message.from} (${message.displayName ?? "no name"}): ` +
      message.body.slice(0, 80)
  )

  // Acknowledge before doing the work, not after.
  //
  // Drafting a reply is a model call with catalog lookups and takes several
  // seconds — far longer than the few Meta allows a webhook before it gives up.
  // Holding the response open means Meta aborts the request, the connection is
  // dropped mid-flight, and the message is lost with a delivery failure logged
  // on their side and nothing at all on ours. `after` runs the work once the
  // 200 is already on its way.
  after(async () => {
    try {
      const ctx = await getAgentContext(orgId, null)
      await receiveMessage(ctx, {
        channel: "whatsapp",
        externalId: message.from,
        displayName: message.displayName,
        body: message.body,
        externalMessageId: message.externalId,
      })
    } catch (err) {
      // Nothing to return a status to any more — the reply already went out.
      // The failure surfaces in the agent_runs ledger and the review inbox.
      console.error("[whatsapp] failed to draft a reply:", err)
    }
  })

  return acknowledge(provider.name)
}
