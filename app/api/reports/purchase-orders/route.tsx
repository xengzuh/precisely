import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { format, parseISO } from "date-fns"
import { getSupabase } from "@/lib/supabase/server"
import { PurchaseOrdersReportTemplate } from "@/components/pdf/PurchaseOrdersReportTemplate"
import type { PORow } from "@/components/pdf/PurchaseOrdersReportTemplate"

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
      .from("purchase_orders")
      .select("quantity, unit_cost, total_cost, status, created_at, suppliers(name), products(name)")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false })

    if (error) return new Response(error.message, { status: 500 })

    type RawOrder = {
      quantity: number
      unit_cost: number
      total_cost: number
      status: string
      created_at: string
      suppliers: { name: string } | null
      products: { name: string } | null
    }
    const raw = (data ?? []) as unknown as RawOrder[]

    const orders: PORow[] = raw.map((o) => ({
      date: format(parseISO(o.created_at), "dd MMM yy"),
      supplierName: o.suppliers?.name ?? "—",
      productName: o.products?.name ?? "—",
      quantity: o.quantity,
      unitCost: Number(o.unit_cost),
      totalCost: Number(o.total_cost),
      status: o.status,
    }))

    const period = `${format(parseISO(startDate), "dd MMM yyyy")} – ${format(parseISO(endDate), "dd MMM yyyy")}`
    const generatedAt = format(new Date(), "dd MMM yyyy, HH:mm")

    const pdfBuffer = await renderToBuffer(
      <PurchaseOrdersReportTemplate period={period} generatedAt={generatedAt} orders={orders} />
    )

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="purchase-orders-report-${startDate}-${endDate}.pdf"`,
      },
    })
  } catch (err) {
    console.error("[reports/purchase-orders]", err)
    return new Response("Failed to generate report", { status: 500 })
  }
}
