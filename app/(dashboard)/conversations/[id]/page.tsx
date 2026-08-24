import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { DraftReply } from "@/components/conversations/DraftReply"
import { Badge } from "@/components/ui/badge"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { getConversation, type ConversationThread } from "@/lib/erp/queries"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const OUTBOUND_LABEL: Record<string, string> = {
  drafted: "draft — not sent",
  approved: "approved — copy into WhatsApp",
  sent: "sent",
  discarded: "discarded",
  failed: "failed to send",
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let thread: ConversationThread | null

  try {
    const ctx = await getUserContext()
    thread = await getConversation(ctx, id)
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load conversation: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  if (!thread) notFound()

  const windowClosed =
    thread.window_expires_at !== null && new Date(thread.window_expires_at) < new Date()

  const drafts = thread.messages.filter((m) => m.status === "drafted")

  return (
    <div className="space-y-4">
      <Link
        href="/conversations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Conversations
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">
          {thread.customerName ?? thread.display_name ?? thread.external_id}
        </h1>
        {thread.customerName ? (
          <Badge variant="secondary">known customer</Badge>
        ) : (
          <Badge variant="outline">not on file</Badge>
        )}
        {thread.status === "waiting_human" && <Badge variant="destructive">needs you</Badge>}
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        {thread.messages
          .filter((m) => m.status !== "drafted")
          .map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.direction === "inbound"
                  ? "bg-muted"
                  : "ml-auto bg-primary/10",
                m.status === "discarded" && "opacity-50 line-through"
              )}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              {m.direction === "outbound" && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {OUTBOUND_LABEL[m.status] ?? m.status}
                </p>
              )}
            </div>
          ))}

        {thread.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
        )}
      </div>

      {drafts.map((draft) => (
        <DraftReply key={draft.id} draft={draft} windowClosed={windowClosed} />
      ))}
    </div>
  )
}
