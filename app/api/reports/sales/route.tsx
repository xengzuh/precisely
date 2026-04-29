import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { format, parseISO } from "date-fns"
import { getSupabase } from "@/lib/supabase/server"
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

    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response("Unauthorized", { status: 401 })

    const { data, error } = await supabase
      .from("transactions")
      .select("quantity, total_price, type, created_at, products(name)")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false })

    if (error) return new Response(error.message, { status: 500 })

    type RawTx = {
      quantity: number
      total_price: number
      type: string
      created_at: string
      products: { name: string } | null
    }
    const rows = (data ?? []) as unknown as RawTx[]

    const transactions: SalesTx[] = rows.map((r) => ({
      date: format(parseISO(r.created_at), "dd MMM yy"),
      product: r.products?.name ?? "—",
      quantity: r.quantity,
      total: Number(r.total_price),
      type: r.type,
    }))

    const saleRows = rows.filter((r) => r.type === "sale")
    const totalRevenue = saleRows.reduce((s, r) => s + Number(r.total_price), 0)
    const totalTransactions = saleRows.length
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

    const productCounts = new Map<string, number>()
    for (const r of saleRows) {
      const name = r.products?.name ?? "Unknown"
      productCounts.set(name, (productCounts.get(name) ?? 0) + r.quantity)
    }
    const bestSelling =
      [...productCounts.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? "—"

    const dailyMap = new Map<string, { revenue: number; count: number }>()
    for (const r of saleRows) {
      const day = r.created_at.slice(0, 10)
      const prev = dailyMap.get(day) ?? { revenue: 0, count: 0 }
      dailyMap.set(day, { revenue: prev.revenue + Number(r.total_price), count: prev.count + 1 })
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
