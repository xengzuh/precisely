import { MessageSquare } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { listConversations, type ConversationListItem } from "@/lib/erp/queries"

export const dynamic = "force-dynamic"

function relative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function ConversationsPage() {
  let conversations: ConversationListItem[]

  try {
    const ctx = await getUserContext()
    conversations = await listConversations(ctx)
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load conversations: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  const waiting = conversations.reduce((n, c) => n + c.pendingDrafts, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          Customer messages and the replies drafted for them. Nothing is sent until you approve
          it.
        </p>
      </div>

      {waiting > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Replies waiting on you</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{waiting}</p>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border divide-y">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <MessageSquare className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          </div>
        ) : (
          conversations.map((c) => (
            <Link
              key={c.id}
              href={`/conversations/${c.id}`}
              className="flex items-start justify-between gap-4 p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {c.customerName ?? c.displayName ?? c.externalId}
                  {!c.customerName && <Badge variant="outline">unknown number</Badge>}
                  {c.status === "waiting_human" && <Badge variant="destructive">needs you</Badge>}
                </p>
                <p className="truncate text-sm text-muted-foreground">{c.lastMessage ?? "—"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{relative(c.lastMessageAt)}</p>
                {c.pendingDrafts > 0 && (
                  <Badge className="mt-1">{c.pendingDrafts} draft</Badge>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
