import { FileText } from "lucide-react"
import Link from "next/link"
import { InvoiceStatusBadge } from "@/components/erp/StatusBadge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { daysUntil, formatDate, formatMoney, type OrgFormat } from "@/lib/erp/format"
import type { InvoiceListItem } from "@/lib/types"

function dueLabel(invoice: InvoiceListItem): string {
  if (invoice.balance <= 0) return "settled"
  const days = daysUntil(invoice.due_date)
  if (days === null) return "—"
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "due today"
  return `in ${days}d`
}

export function InvoicesTable({
  invoices,
  org,
  showCustomer = true,
  emptyMessage = "No invoices yet.",
}: {
  invoices: InvoiceListItem[]
  org: OrgFormat
  showCustomer?: boolean
  emptyMessage?: string
}) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
        <FileText className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead className="hidden sm:table-cell">Issued</TableHead>
          <TableHead className="hidden md:table-cell">Due</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((i) => {
          const money = { ...org, currency: i.currency }
          return (
            <TableRow key={i.id}>
              <TableCell className="font-medium">
                <Link href={`/invoices/${i.id}`} className="font-mono text-xs hover:underline">
                  {i.invoice_no}
                </Link>
              </TableCell>
              {showCustomer && (
                <TableCell>
                  {i.customerName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
              )}
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {formatDate(i.issue_date, org)}
              </TableCell>
              <TableCell
                className={`hidden md:table-cell ${i.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
              >
                {dueLabel(i)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(i.total, money)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {i.balance > 0 ? formatMoney(i.balance, money) : "—"}
              </TableCell>
              <TableCell>
                <InvoiceStatusBadge status={i.status} isOverdue={i.isOverdue} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
