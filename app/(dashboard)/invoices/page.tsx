import Link from "next/link"
import { redirect } from "next/navigation"
import { InvoicesTable } from "@/components/invoices/InvoicesTable"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatMoney } from "@/lib/erp/format"
import { getOrganization, listInvoices } from "@/lib/erp/queries"
import { cn } from "@/lib/utils"
import type { InvoiceListItem, OrganizationRow } from "@/lib/types"

export const dynamic = "force-dynamic"

const FILTERS = [
  { value: "outstanding", label: "Outstanding" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
]

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "outstanding" } = await searchParams

  let invoices: InvoiceListItem[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [invoiceRows, orgRow] = await Promise.all([listInvoices(ctx), getOrganization(ctx)])
    invoices = invoiceRows
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load invoices: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  const visible =
    status === "all"
      ? invoices
      : status === "outstanding"
        ? invoices.filter((i) => i.balance > 0 && i.status !== "void")
        : status === "overdue"
          ? invoices.filter((i) => i.isOverdue)
          : invoices.filter((i) => i.status === status)

  // Receivables, not revenue: what has been invoiced and not yet collected.
  const totalOutstanding = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + i.balance, 0)
  const totalOverdue = invoices
    .filter((i) => i.isOverdue)
    .reduce((sum, i) => sum + i.balance, 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Invoices</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatMoney(totalOutstanding, org)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums",
                totalOverdue > 0 && "text-destructive"
              )}
            >
              {formatMoney(totalOverdue, org)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/invoices?status=${f.value}`}
            className={cn(
              buttonVariants({ variant: status === f.value ? "default" : "outline", size: "sm" })
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <InvoicesTable
          invoices={visible}
          org={org}
          emptyMessage={
            status === "all"
              ? "No invoices yet. Raise one from a fulfilled sales order."
              : `No ${status} invoices.`
          }
        />
      </div>
    </div>
  )
}
