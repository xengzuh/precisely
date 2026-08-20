"use client"

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { submitDocument } from "@/app/(dashboard)/inbox/actions"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { IntakeOutcome } from "@/lib/ai/agents/apply-intake"

/**
 * Drop a purchase order in, see what the agent made of it.
 *
 * The result stays on screen with the low-confidence lines called out, because
 * the point of this screen is the review — an extraction you cannot check is
 * not worth having.
 */
export function IntakeForm({ configured }: { configured: boolean }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<IntakeOutcome | null>(null)

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await submitDocument(formData)
      setOutcome(result)
      if (result.status === "failed") {
        toast.error(result.error ?? "Extraction failed")
      } else {
        toast.success(
          result.status === "created" ? "Draft order created" : "Order queued for approval"
        )
        formRef.current?.reset()
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process the document")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">The intake agent is not configured</p>
            <p className="mt-1 text-amber-700">
              Add <code className="font-mono">ANTHROPIC_API_KEY</code> to{" "}
              <code className="font-mono">.env.local</code> and restart the dev server. It is
              server-side only — never give it a <code className="font-mono">NEXT_PUBLIC_</code>{" "}
              prefix.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <form ref={formRef} action={onSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="in-file">Purchase order PDF</Label>
              <Input id="in-file" name="file" type="file" accept="application/pdf" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="in-from">From</Label>
                <Input id="in-from" name="fromAddress" placeholder="orders@acme.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="in-subject">Subject</Label>
                <Input id="in-subject" name="subject" placeholder="PO 4471" />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="in-text">Or paste the order text</Label>
              <Textarea
                id="in-text"
                name="text"
                rows={6}
                placeholder={"Hi,\n\nPlease supply:\n2 x 200 L drums IPA 99%\n500 kg caustic soda flakes\n\nDelivery by 30 Aug.\nThanks"}
              />
            </div>

            <div>
              <Button type="submit" disabled={busy || !configured}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Reading…
                  </>
                ) : (
                  <>
                    <FileUp className="size-4" /> Extract order
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {outcome && outcome.status !== "failed" && <ExtractionResult outcome={outcome} />}
    </div>
  )
}

function ExtractionResult({ outcome }: { outcome: IntakeOutcome }) {
  const { extraction } = outcome
  const flagged = extraction.lines.filter((l) => !l.productId || l.needsReview).length

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-muted-foreground" />
            <p className="font-medium">
              {extraction.lines.length} line{extraction.lines.length === 1 ? "" : "s"} extracted
            </p>
            {flagged > 0 && <Badge variant="destructive">{flagged} need review</Badge>}
            <Badge variant="outline">
              {outcome.status === "created" ? "draft created" : "queued for approval"}
            </Badge>
          </div>

          {outcome.orderId ? (
            <Link
              href={`/orders/${outcome.orderId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open order
            </Link>
          ) : (
            <Link href="/agents" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Review in Agents
            </Link>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {extraction.customerNameRaw ?? "No customer named"}
          {extraction.customerRef && ` · their ref ${extraction.customerRef}`}
          {!extraction.customerId && (
            <span className="ml-2 text-destructive">customer not matched</span>
          )}
        </div>

        <ul className="divide-y rounded-lg border">
          {extraction.lines.map((line, i) => (
            <li key={i} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className={line.productId ? "font-medium" : "font-medium text-destructive"}>
                  {line.productId ? line.descriptionRaw : `Unmatched — ${line.descriptionRaw}`}
                </p>
                {line.notes && (
                  <p className="text-xs text-muted-foreground">{line.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 tabular-nums">
                <span>
                  {line.qty} {line.uom}
                </span>
                {line.packageCount !== null && (
                  <Badge variant="outline">{line.packageCount} pkg</Badge>
                )}
                {line.matchConfidence !== null && line.matchConfidence < 1 && (
                  <Badge variant="outline">{Math.round(line.matchConfidence * 100)}%</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>

        {extraction.documentNotes && (
          <p className="text-xs text-muted-foreground">{extraction.documentNotes}</p>
        )}
      </CardContent>
    </Card>
  )
}
