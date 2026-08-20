"use client"

import { Ban, CheckCircle2, FileText, Loader2, PackageCheck, Truck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import {
  allocateOrder,
  cancelOrder,
  confirmOrder,
  fulfilOrder,
  invoiceOrder,
} from "@/app/(dashboard)/orders/actions"
import { Button } from "@/components/ui/button"
import type { SalesOrderDetail } from "@/lib/types"

type Step = {
  key: string
  label: string
  icon: typeof CheckCircle2
  variant?: "default" | "outline" | "destructive"
  run: () => Promise<void>
  /** why the step is unavailable, shown instead of the buttons */
  blockedBy?: string
}

/**
 * The order status ratchet, as buttons.
 *
 * Only the transitions legal from the current status are offered. The database
 * functions enforce the same rules, so this is convenience rather than
 * security — but showing a button that always errors is its own kind of bug.
 */
export function OrderWorkflow({ order }: { order: SalesOrderDetail }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function run(step: Step) {
    setBusy(step.key)
    try {
      await step.run()
      toast.success(`${step.label} — done`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${step.label} failed`)
    } finally {
      setBusy(null)
    }
  }

  const unmatched = order.lines.filter((l) => !l.productId).length

  const steps: Step[] = []

  if (order.status === "draft") {
    steps.push({
      key: "confirm",
      label: "Confirm",
      icon: CheckCircle2,
      run: () => confirmOrder(order.id),
      blockedBy:
        unmatched > 0
          ? `${unmatched} line${unmatched === 1 ? "" : "s"} not matched to a product`
          : undefined,
    })
  }

  if (order.status === "draft" || order.status === "confirmed") {
    steps.push({
      key: "allocate",
      label: "Reserve stock",
      icon: PackageCheck,
      variant: order.status === "confirmed" ? "default" : "outline",
      run: () => allocateOrder(order.id),
      blockedBy: unmatched > 0 ? "Resolve unmatched lines first" : undefined,
    })
  }

  if (order.status === "allocated") {
    steps.push({
      key: "fulfil",
      label: "Fulfil & ship",
      icon: Truck,
      run: () => fulfilOrder(order.id),
    })
  }

  if ((order.status === "allocated" || order.status === "fulfilled") && !order.invoiceId) {
    steps.push({
      key: "invoice",
      label: "Raise invoice",
      icon: FileText,
      variant: order.status === "fulfilled" ? "default" : "outline",
      run: async () => {
        const invoiceId = await invoiceOrder(order.id)
        router.push(`/invoices/${invoiceId}`)
      },
    })
  }

  if (order.status !== "cancelled" && order.status !== "invoiced") {
    steps.push({
      key: "cancel",
      label: "Cancel",
      icon: Ban,
      variant: "destructive",
      run: () => cancelOrder(order.id),
    })
  }

  if (steps.length === 0) return null

  const blocked = steps.filter((s) => s.blockedBy)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <Button
              key={step.key}
              size="sm"
              variant={step.variant ?? "outline"}
              disabled={busy !== null || step.blockedBy !== undefined}
              onClick={() => run(step)}
            >
              {busy === step.key ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
              {step.label}
            </Button>
          )
        })}
      </div>
      {blocked.map((step) => (
        <p key={step.key} className="text-xs text-destructive">
          {step.label}: {step.blockedBy}
        </p>
      ))}
    </div>
  )
}
