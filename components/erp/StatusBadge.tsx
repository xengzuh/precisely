import { Badge } from "@/components/ui/badge"
import type { InvoiceStatus, OrderSource, SalesOrderStatus } from "@/types/database"

type Variant = "default" | "secondary" | "destructive" | "outline"

/**
 * Status pills for orders and invoices.
 *
 * The mapping is deliberately shared: an operator scanning three different
 * screens should not have to relearn what a colour means. Anything demanding
 * action is `destructive`, anything settled is `default`, work in progress is
 * `secondary`, and dormant states are `outline`.
 */
const ORDER_VARIANTS: Record<SalesOrderStatus, Variant> = {
  draft: "outline",
  confirmed: "secondary",
  allocated: "secondary",
  fulfilled: "default",
  invoiced: "default",
  cancelled: "outline",
}

const INVOICE_VARIANTS: Record<InvoiceStatus, Variant> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  overdue: "destructive",
  void: "outline",
}

export function OrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  return <Badge variant={ORDER_VARIANTS[status]}>{status}</Badge>
}

export function InvoiceStatusBadge({
  status,
  isOverdue,
}: {
  status: InvoiceStatus
  isOverdue?: boolean
}) {
  // `overdue` is derived from the due date rather than stored, so a "sent"
  // invoice past its date must still read as overdue.
  const effective: InvoiceStatus = isOverdue && status === "sent" ? "overdue" : status
  return <Badge variant={INVOICE_VARIANTS[effective]}>{effective}</Badge>
}

/** Marks rows an agent created, so a human can tell at a glance what to check. */
export function SourceBadge({ source }: { source: OrderSource }) {
  if (source === "manual") return null
  return <Badge variant="outline">{source}</Badge>
}
