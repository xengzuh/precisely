import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { CustomerHeader } from "@/components/customers/CustomerHeader"
import { InvoicesTable } from "@/components/invoices/InvoicesTable"
import { SalesOrdersTable } from "@/components/orders/SalesOrdersTable"
import { Card, CardContent } from "@/components/ui/card"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatMoney } from "@/lib/erp/format"
import {
  getCustomerById,
  getOrganization,
  listInvoices,
  listSalesOrders,
} from "@/lib/erp/queries"
import type {
  CustomerRow,
  InvoiceListItem,
  OrganizationRow,
  SalesOrderListItem,
} from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let customer: CustomerRow | null
  let orders: SalesOrderListItem[]
  let invoices: InvoiceListItem[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [customerRow, orgRow, orderRows, invoiceRows] = await Promise.all([
      getCustomerById(ctx, id),
      getOrganization(ctx),
      listSalesOrders(ctx, id),
      listInvoices(ctx, id),
    ])
    customer = customerRow
    org = orgRow
    orders = orderRows
    invoices = invoiceRows
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load customer: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  if (!customer) notFound()

  const outstanding = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + i.balance, 0)

  const facts: [string, string][] = [
    ["Payment terms", `${customer.payment_terms_days} days`],
    ["Credit limit", customer.credit_limit === null ? "—" : formatMoney(customer.credit_limit, org)],
    ["Outstanding", formatMoney(outstanding, org)],
    ["Tax ID", customer.tax_id ?? "—"],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Customers
      </Link>

      <CustomerHeader customer={customer} />

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

      {(customer.billing_address || customer.delivery_address) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {customer.billing_address && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Billing address</p>
                <p className="mt-1 whitespace-pre-line text-sm">{customer.billing_address}</p>
              </CardContent>
            </Card>
          )}
          {customer.delivery_address && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Delivery address</p>
                <p className="mt-1 whitespace-pre-line text-sm">{customer.delivery_address}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Sales orders</h2>
        <div className="overflow-hidden rounded-xl border">
          <SalesOrdersTable
            orders={orders}
            org={org}
            showCustomer={false}
            emptyMessage="No orders from this customer yet."
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <div className="overflow-hidden rounded-xl border">
          <InvoicesTable
            invoices={invoices}
            org={org}
            showCustomer={false}
            emptyMessage="No invoices for this customer yet."
          />
        </div>
      </section>
    </div>
  )
}
