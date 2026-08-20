import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { OrderStatusBadge, SourceBadge } from "@/components/erp/StatusBadge"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatMoney, type OrgFormat } from "@/lib/erp/format"
import type { SalesOrderListItem } from "@/lib/types"

/**
 * Shared by the orders list and the customer detail page — no hooks, so it
 * renders on the server in both.
 */
export function SalesOrdersTable({
  orders,
  org,
  showCustomer = true,
  emptyMessage = "No sales orders yet.",
}: {
  orders: SalesOrderListItem[]
  org: OrgFormat
  showCustomer?: boolean
  emptyMessage?: string
}) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
        <ClipboardList className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead className="hidden sm:table-cell">Date</TableHead>
          <TableHead className="hidden text-right md:table-cell">Lines</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="font-medium">
              <Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">
                {o.order_no}
              </Link>
              {o.needs_review && (
                <Badge variant="destructive" className="ml-2">
                  review
                </Badge>
              )}
            </TableCell>
            {showCustomer && (
              <TableCell>{o.customerName ?? <span className="text-muted-foreground">—</span>}</TableCell>
            )}
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              {formatDate(o.order_date, org)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
              {o.lineCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(o.total, { ...org, currency: o.currency })}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <OrderStatusBadge status={o.status} />
                <SourceBadge source={o.source} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
