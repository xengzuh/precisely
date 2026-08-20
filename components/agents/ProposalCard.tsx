"use client"

import { Check, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { approveProposal, rejectProposal } from "@/app/(dashboard)/agents/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AgentActionRow } from "@/lib/types"

const RISK_VARIANT = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
} as const

/**
 * One queued agent action, with what it would do and the arguments it would
 * do it with.
 *
 * The raw arguments are shown rather than a prose summary alone: approving is
 * the moment a human takes responsibility for the write, and "create a sales
 * order" is not enough to judge — the quantities and the customer are.
 */
export function ProposalCard({ action }: { action: AgentActionRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")

  async function approve() {
    setBusy("approve")
    try {
      const status = await approveProposal(action.id)
      toast.success(status === "executed" ? "Approved and executed" : "Approved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve")
    } finally {
      setBusy(null)
    }
  }

  async function reject() {
    setBusy("reject")
    try {
      await rejectProposal(action.id, reason)
      toast.success("Rejected")
      setRejecting(false)
      setReason("")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{action.summary ?? action.action}</p>
            <p className="font-mono text-xs text-muted-foreground">{action.action}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={RISK_VARIANT[action.risk]}>{action.risk} risk</Badge>
            <Badge variant="outline">{action.actor}</Badge>
          </div>
        </div>

        <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
          {JSON.stringify(action.args, null, 2)}
        </pre>

        {rejecting && (
          <Textarea
            rows={2}
            placeholder="Why is this wrong? The agent is told, so it can do better next time."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy !== null} onClick={approve}>
            {busy === "approve" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve
          </Button>

          {rejecting ? (
            <>
              <Button size="sm" variant="destructive" disabled={busy !== null} onClick={reject}>
                {busy === "reject" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Confirm reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setRejecting(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setRejecting(true)}
            >
              <X className="size-4" />
              Reject
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
