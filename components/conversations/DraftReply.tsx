"use client"

import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { approveReply, discardReply } from "@/app/(dashboard)/conversations/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { ConversationMessageRow } from "@/types/database"

/**
 * A drafted reply, waiting on a person.
 *
 * Editable before approval, because the fastest useful correction is usually
 * rewording rather than rejecting — and an edit is a signal about the prompt
 * that a discard does not give you.
 */
export function DraftReply({
  draft,
  windowClosed,
}: {
  draft: ConversationMessageRow
  windowClosed: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState<"send" | "discard" | null>(null)

  const edited = body.trim() !== draft.body.trim()

  async function send() {
    if (!body.trim()) return toast.error("The reply is empty")
    setBusy("send")
    try {
      await approveReply(draft.id, edited ? body.trim() : undefined)
      toast.success("Approved — copy it into WhatsApp to send")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve")
    } finally {
      setBusy(null)
    }
  }

  async function discard() {
    setBusy("discard")
    try {
      await discardReply(draft.id)
      toast.success("Discarded")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to discard")
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(body)
    toast.success("Copied")
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Drafted reply</span>
        {draft.intent && <Badge variant="outline">{draft.intent}</Badge>}
        {draft.would_auto_send ? (
          <Badge variant="secondary">would send itself</Badge>
        ) : (
          <Badge variant="destructive">needs a person</Badge>
        )}
      </div>

      {draft.reason && <p className="text-xs text-muted-foreground">{draft.reason}</p>}

      <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />

      {windowClosed && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The 24-hour reply window has closed. WhatsApp will only accept a pre-approved
            template now, so this cannot be sent as written.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null || windowClosed} onClick={send}>
          {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {edited ? "Approve edited" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" />
          Copy
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={discard}>
          {busy === "discard" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          Discard
        </Button>
      </div>
    </div>
  )
}
