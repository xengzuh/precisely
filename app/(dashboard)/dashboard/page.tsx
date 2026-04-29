import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, TrendingUp, TrendingDown, Wallet, Package } from "lucide-react"
import { getSupabase } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { MonthlyReportButton } from "@/components/dashboard/MonthlyReportButton"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RevenueChart, type ChartEntry } from "@/components/revenue-chart"

export const dynamic = "force-dynamic"

// ── Helpers ─────────────────────────────────────────────────────────────────

function myr(n: number): string {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(n)
}

/** "2024-04-18" → "18 Apr 2024" */
function fmtDate(d: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [y, m, day] = d.split("-")
  return `${day} ${months[parseInt(m, 10) - 1]} ${y}`
}

/** "2024-04-18" → "18 Apr" (chart axis label) */
function shortDate(d: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [, m, day] = d.split("-")
  return `${day} ${months[parseInt(m, 10) - 1]}`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  valueClassName,
}: {
  title: string
  value: string
  icon: ReactNode
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={cn("text-xl font-bold tabular-nums mt-0.5 truncate", valueClassName)}>
              {value}
            </p>
          </div>
          <div className="text-muted-foreground shrink-0 mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Local types ──────────────────────────────────────────────────────────────

type SaleTx = { total_price: number | string; created_at: string }
type PurchaseTx = { total_price: number | string }
type LowStockProduct = { id: string; name: string; stock: number }

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await getSupabase()

  // Redirect new users to onboarding before they see an empty dashboard
  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
  if ((productCount ?? 0) === 0) redirect("/onboarding")

  const [
    { data: rawSales },
    { data: rawPurchases },
    { data: rawLowStock },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("total_price, created_at")
      .eq("type", "sale")
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("total_price")
      .eq("type", "purchase"),
    supabase
      .from("products")
      .select("id, name, stock")
      .lt("stock", 10)
      .order("stock"),
  ])

  const sales = (rawSales ?? []) as SaleTx[]
  const purchases = (rawPurchases ?? []) as PurchaseTx[]
  const lowStock = (rawLowStock ?? []) as LowStockProduct[]

  // ── Aggregate stats ──
  const revenue = sales.reduce((s, t) => s + Number(t.total_price), 0)
  const expenses = purchases.reduce((s, t) => s + Number(t.total_price), 0)
  const netProfit = revenue - expenses

  // ── Group sales by UTC date ──
  const dailyMap = new Map<string, { count: number; revenue: number }>()
  for (const tx of sales) {
    const date = tx.created_at.slice(0, 10) // "YYYY-MM-DD" in UTC
    const prev = dailyMap.get(date) ?? { count: 0, revenue: 0 }
    dailyMap.set(date, {
      count: prev.count + 1,
      revenue: prev.revenue + Number(tx.total_price),
    })
  }
  const dailySales = [...dailyMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, stats]) => ({ date, ...stats }))

  // ── Last 7 days chart data (fills 0 for days with no sales) ──
  const todayUtc = new Date()
  const chartData: ChartEntry[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayUtc)
    d.setUTCDate(d.getUTCDate() - (6 - i))
    const date = d.toISOString().slice(0, 10)
    return {
      date,
      label: shortDate(date),
      revenue: dailyMap.get(date)?.revenue ?? 0,
    }
  })

  return (
    <div className="space-y-6">
      {/* ── Dashboard header ── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <MonthlyReportButton />
      </div>

      {/* ── Low Stock Banner ── */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-amber-800 text-sm">
                {lowStock.length} product{lowStock.length > 1 ? "s" : ""} running low on stock
              </p>
              <ul className="mt-1.5 space-y-1">
                {lowStock.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 text-sm text-amber-700"
                  >
                    <span>
                      {p.name}{" "}
                      <span className="font-semibold">({p.stock} left)</span>
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

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={myr(revenue)}
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          title="Total Expenses"
          value={myr(expenses)}
          icon={<TrendingDown className="size-5" />}
        />
        <StatCard
          title="Net Profit"
          value={myr(netProfit)}
          icon={<Wallet className="size-5" />}
          valueClassName={netProfit < 0 ? "text-destructive" : undefined}
        />
        <StatCard
          title="Low Stock Alerts"
          value={String(lowStock.length)}
          icon={<Package className="size-5" />}
          valueClassName={lowStock.length > 0 ? "text-amber-600" : undefined}
        />
      </div>

      {/* ── Daily Sales Table ── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Daily Sales</h2>
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailySales.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No sales yet.
                  </TableCell>
                </TableRow>
              ) : (
                dailySales.map(({ date, count, revenue: dayRevenue }) => (
                  <TableRow key={date}>
                    <TableCell className="font-medium">{fmtDate(date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {myr(dayRevenue)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ── Revenue Chart ── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Revenue — Last 7 Days</h2>
        <Card>
          <CardContent className="pt-2 pb-2">
            <RevenueChart data={chartData} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
