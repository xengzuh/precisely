"use client"

import { Download, Loader2, Send, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { markInvoiceSent, recordPayment } from "@/app/(dashboard)/invoices/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney, type OrgFormat } from "@/lib/erp/format"
import type { InvoiceDetail } from "@/lib/types"

export function InvoiceActions({
  invoice,
  org,
}: {
  invoice: InvoiceDetail
  org: OrgFormat
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState(String(invoice.balance))
  const [paying, setPaying] = useState(false)

  const money = { ...org, currency: invoice.currency }

  async function send() {
    setSending(true)
    try {
      await markInvoiceSent(invoice.id)
      toast.success(`${invoice.invoice_no} marked as sent`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice")
    } finally {
      setSending(false)
    }
  }

  async function pay() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount greater than zero")
      return
    }
    if (value > invoice.balance) {
      toast.error(`That is more than the ${formatMoney(invoice.balance, money)} outstanding`)
      return
    }

    setPaying(true)
    try {
      await recordPayment(invoice.id, value)
      setPayOpen(false)
      toast.success(`Payment of ${formatMoney(value, money)} recorded`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment")
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {invoice.status === "draft" && (
          <Button size="sm" disabled={sending} onClick={send}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Mark as sent
          </Button>
        )}

        {invoice.balance > 0 && invoice.status !== "void" && invoice.status !== "draft" && (
          <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
            <Wallet className="size-4" />
            Record payment
          </Button>
        )}

        <a
          href={`/api/invoices/${invoice.id}/pdf`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          <Download className="size-4" />
          PDF
        </a>
      </div>

      <Dialog open={payOpen} onOpenChange={(o) => !paying && setPayOpen(o)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="ip-amount">Amount received</Label>
            <Input
              id="ip-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {formatMoney(invoice.balance, money)} outstanding. Partial payments are allowed; the
              invoice is marked paid once it is fully settled.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={paying} onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button disabled={paying} onClick={pay}>
              {paying ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Recording…
                </>
              ) : (
                "Record"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
