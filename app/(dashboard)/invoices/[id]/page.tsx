import { ArrowLeft, ClipboardList } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { InvoiceStatusBadge } from "@/components/erp/StatusBadge"
import { InvoiceActions } from "@/components/invoices/InvoiceActions"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatDate, formatMoney } from "@/lib/erp/format"
import { getInvoiceDetail, getOrganization } from "@/lib/erp/queries"
import type { InvoiceDetail, OrganizationRow } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let invoice: InvoiceDetail | null
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [invoiceRow, orgRow] = await Promise.all([
      getInvoiceDetail(ctx, id),
      getOrganization(ctx),
    ])
    invoice = invoiceRow
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load invoice: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  if (!invoice) notFound()

  const money = { ...org, currency: invoice.currency }
  const facts: [string, string][] = [
    ["Issued", formatDate(invoice.issue_date, org)],
    ["Due", formatDate(invoice.due_date, org)],
    ["Paid", formatMoney(invoice.amount_paid, money)],
    ["Balance", formatMoney(invoice.balance, money)],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-xl font-semibold">{invoice.invoice_no}</h1>
            <InvoiceStatusBadge status={invoice.status} isOverdue={invoice.isOverdue} />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.customer ? (
              <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                {invoice.customer.name}
              </Link>
            ) : (
              "No customer"
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(invoice.total, money)}</p>
        </div>
      </div>

      <InvoiceActions invoice={invoice} org={org} />

      {invoice.order_id && (
        <Link
          href={`/orders/${invoice.order_id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ClipboardList className="size-4" />
          From order {invoice.orderNo}
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-medium tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Lines</h2>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-xs text-muted-foreground">{line.line_no}</TableCell>
                  <TableCell>
                    <span className="font-medium">{line.description}</span>
                    {line.productSku && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {line.productSku}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.qty} {line.uom}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.unit_price, money)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.line_total, money)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatMoney(invoice.subtotal, money)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{org.tax_label}</span>
          <span className="tabular-nums">{formatMoney(invoice.tax, money)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(invoice.total, money)}</span>
        </div>
      </div>
    </div>
  )
}
