import { receiveMessage } from "@/lib/ai/agents/conversation"
import { getAgentContext } from "@/lib/erp/actions/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Talk to the customer assistant without WhatsApp in the way.
 *
 * Development only, and it refuses to exist in production, so it cannot become
 * an accidental public endpoint pointed at your catalog. It runs on the agent
 * context rather than a session so it can be driven from a script.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not available", { status: 404 })
  }

  try {
    const body = (await request.json()) as {
      message?: string
      from?: string
      name?: string
    }

    if (!body.message?.trim()) {
      return new Response("Nothing to reply to", { status: 400 })
    }

    const orgId = process.env.AGENT_ORG_ID
    if (!orgId) {
      return new Response("Set AGENT_ORG_ID in .env.local to use this endpoint", { status: 501 })
    }

    // The org that unattended agent work belongs to — same setting the inbound
    // webhook uses, and for the same reason: never taken from the request.
    const ctx = await getAgentContext(orgId, null)
    const result = await receiveMessage(ctx, {
      channel: "test",
      // Defaults to a number the seed data knows, so customer resolution and
      // learned aliases are exercised rather than skipped.
      externalId: body.from ?? "60123456789",
      displayName: body.name ?? null,
      body: body.message,
    })

    return Response.json(result)
  } catch (err) {
    console.error("[dev/chat]", err)
    return new Response(err instanceof Error ? err.message : "Failed", { status: 500 })
  }
}
