import { AlertTriangle, Package, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { MonthlyReportButton } from "@/components/dashboard/MonthlyReportButton"
import { RevenueChart, type ChartEntry } from "@/components/revenue-chart"
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
import { getDashboardMetrics, getOrganization, listLowStock } from "@/lib/erp/queries"
import { formatQty } from "@/lib/erp/uom"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

/** "2026-04-18" → "18 Apr", in the org's locale. */
function shortDate(d: string, org: { locale: string }): string {
  return new Intl.DateTimeFormat(org.locale, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`))
}

function StatCard({
  title,
  value,
  hint,
  icon,
  valueClassName,
}: {
  title: string
  value: string
  hint?: string
  icon: ReactNode
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={cn("mt-0.5 truncate text-xl font-bold tabular-nums", valueClassName)}>
              {value}
            </p>
            {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  let metrics
  let lowStock
  let org

  try {
    const ctx = await getUserContext()

    const { count: productCount } = await ctx.db
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)

    if ((productCount ?? 0) === 0) redirect("/onboarding")

    ;[metrics, lowStock, org] = await Promise.all([
      getDashboardMetrics(ctx),
      listLowStock(ctx),
      getOrganization(ctx),
    ])
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    throw err
  }

  const chartData: ChartEntry[] = metrics.dailyRevenue.map((d) => ({
    date: d.date,
    label: shortDate(d.date, org),
    revenue: d.revenue,
  }))

  const marginPct =
    metrics.revenue > 0 ? Math.round((metrics.grossMargin / metrics.revenue) * 100) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <MonthlyReportButton />
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-800">
                {lowStock.length} product{lowStock.length > 1 ? "s" : ""} at or below reorder point
              </p>
              <ul className="mt-1.5 space-y-1">
                {lowStock.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 text-sm text-amber-700"
                  >
                    <span>
                      {p.name}{" "}
                      <span className="font-semibold">
                        ({formatQty(p.available, p.base_uom)} left)
                      </span>
                    </span>
                    <Link
                      href={`/purchase-orders?product=${p.id}`}
                      className="shrink-0 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:no-underline"
                    >
                      Reorder →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Revenue (30d)"
          value={formatMoney(metrics.revenue, org)}
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          title="Cost of goods sold"
          value={formatMoney(metrics.cogs, org)}
          hint={`Purchases: ${formatMoney(metrics.purchaseSpend, org)}`}
          icon={<TrendingDown className="size-5" />}
        />
        {/*
          Gross margin, not "net profit". The old figure subtracted all purchase
          spend from revenue, so any month with a large restock showed a loss
          even when every sale was profitable.
        */}
        <StatCard
          title="Gross margin"
          value={formatMoney(metrics.grossMargin, org)}
          hint={marginPct !== null ? `${marginPct}% of revenue` : undefined}
          icon={<Wallet className="size-5" />}
          valueClassName={metrics.grossMargin < 0 ? "text-destructive" : undefined}
        />
        <StatCard
          title="Low stock alerts"
          value={String(metrics.lowStockCount)}
          icon={<Package className="size-5" />}
          valueClassName={metrics.lowStockCount > 0 ? "text-amber-600" : undefined}
        />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Daily revenue</h2>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.dailyRevenue.every((d) => d.revenue === 0) ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                    No sales in the last 7 days.
                  </TableCell>
                </TableRow>
              ) : (
                [...metrics.dailyRevenue]
                  .reverse()
                  .map(({ date, revenue }) => (
                    <TableRow key={date}>
                      <TableCell className="font-medium">{formatDate(date, org)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(revenue, org)}</TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Revenue — last 7 days</h2>
        <Card>
          <CardContent className="pt-2 pb-2">
            <RevenueChart data={chartData} org={org} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
