import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { format, parseISO } from "date-fns"
import { getUserContext } from "@/lib/erp/actions/context"
import { SalesReportTemplate } from "@/components/pdf/SalesReportTemplate"
import type { SalesTx, DailyEntry } from "@/components/pdf/SalesReportTemplate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    if (!startDate || !endDate) {
      return new Response("startDate and endDate query params are required", { status: 400 })
    }

    const ctx = await getUserContext()

    const { data, error } = await ctx.db
      .from("stock_moves")
      .select("qty, unit_cost, reason, direction, created_at, products(name)")
      .eq("org_id", ctx.orgId)
      .in("reason", ["sale", "purchase"])
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false })

    if (error) return new Response(error.message, { status: 500 })

    type RawMove = {
      qty: number
      unit_cost: number | null
      reason: string
      created_at: string
      products: { name: string } | null
    }
    const rows = (data ?? []) as RawMove[]
    const valueOf = (r: RawMove) => r.qty * Number(r.unit_cost ?? 0)

    const transactions: SalesTx[] = rows.map((r) => ({
      date: format(parseISO(r.created_at), "dd MMM yy"),
      product: r.products?.name ?? "—",
      quantity: r.qty,
      total: valueOf(r),
      type: r.reason,
    }))

    const saleRows = rows.filter((r) => r.reason === "sale")
    const totalRevenue = saleRows.reduce((s, r) => s + valueOf(r), 0)
    const totalTransactions = saleRows.length
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

    const productCounts = new Map<string, number>()
    for (const r of saleRows) {
      const name = r.products?.name ?? "Unknown"
      productCounts.set(name, (productCounts.get(name) ?? 0) + r.qty)
    }
    const bestSelling =
      [...productCounts.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? "—"

    const dailyMap = new Map<string, { revenue: number; count: number }>()
    for (const r of saleRows) {
      const day = r.created_at.slice(0, 10)
      const prev = dailyMap.get(day) ?? { revenue: 0, count: 0 }
      dailyMap.set(day, { revenue: prev.revenue + valueOf(r), count: prev.count + 1 })
    }
    const dailyData: DailyEntry[] = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date: format(parseISO(date), "dd MMM"),
        ...stats,
      }))

    const period = `${format(parseISO(startDate), "dd MMM yyyy")} – ${format(parseISO(endDate), "dd MMM yyyy")}`
    const generatedAt = format(new Date(), "dd MMM yyyy, HH:mm")

    const pdfBuffer = await renderToBuffer(
      <SalesReportTemplate
        period={period}
        generatedAt={generatedAt}
        transactions={transactions}
        summary={{ totalRevenue, totalTransactions, avgTransactionValue, bestSelling }}
        dailyData={dailyData}
      />
    )

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sales-report-${startDate}-${endDate}.pdf"`,
      },
    })
  } catch (err) {
    console.error("[reports/sales]", err)
    return new Response("Failed to generate report", { status: 500 })
  }
}
