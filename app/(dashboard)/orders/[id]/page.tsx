import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { OrderStatusBadge, SourceBadge } from "@/components/erp/StatusBadge"
import { OrderLinesTable } from "@/components/orders/OrderLinesTable"
import { OrderWorkflow } from "@/components/orders/OrderWorkflow"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatDate, formatMoney } from "@/lib/erp/format"
import { getOrganization, getSalesOrderDetail, listProducts } from "@/lib/erp/queries"
import type { OrganizationRow, ProductListItem, SalesOrderDetail } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order: SalesOrderDetail | null
  let products: ProductListItem[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [orderRow, productRows, orgRow] = await Promise.all([
      getSalesOrderDetail(ctx, id),
      listProducts(ctx),
      getOrganization(ctx),
    ])
    order = orderRow
    products = productRows
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load order: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  if (!order) notFound()

  const money = { ...org, currency: order.currency }
  const facts: [string, string][] = [
    ["Order date", formatDate(order.order_date, org)],
    ["Requested", formatDate(order.requested_date, org)],
    ["Subtotal", formatMoney(order.subtotal, money)],
    [`${org.tax_label}`, formatMoney(order.tax, money)],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Sales Orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-xl font-semibold">{order.order_no}</h1>
            <OrderStatusBadge status={order.status} />
            <SourceBadge source={order.source} />
          </div>
          <p className="text-sm text-muted-foreground">
            {order.customer ? (
              <Link href={`/customers/${order.customer.id}`} className="hover:underline">
                {order.customer.name}
              </Link>
            ) : (
              <span className="text-destructive">No customer identified</span>
            )}
            {order.customer_ref && ` · their ref ${order.customer_ref}`}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(order.total, money)}</p>
        </div>
      </div>

      <OrderWorkflow order={order} />

      {order.invoiceId && (
        <Link
          href={`/invoices/${order.invoiceId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileText className="size-4" />
          View invoice {order.invoiceNo}
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
          <OrderLinesTable order={order} products={products} org={org} />
        </div>
      </section>

      {order.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-line text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
