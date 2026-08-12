import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { format, parseISO } from "date-fns"
import { getUserContext } from "@/lib/erp/actions/context"
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

    const ctx = await getUserContext()

    // Quantity and cost moved onto the line items, so the report is now one
    // row per line rather than one per order.
    const { data, error } = await ctx.db
      .from("purchase_order_lines")
      .select(
        "qty, uom, unit_cost, line_total, products(name), purchase_orders(order_no, status, order_date, suppliers(name))"
      )
      .eq("org_id", ctx.orgId)
      .gte("purchase_orders.order_date", startDate)
      .lte("purchase_orders.order_date", endDate)

    if (error) return new Response(error.message, { status: 500 })

    const orders: PORow[] = (data ?? [])
      .filter((l) => l.purchase_orders !== null)
      .map((l) => ({
        date: format(parseISO(l.purchase_orders!.order_date), "dd MMM yy"),
        supplierName: l.purchase_orders!.suppliers?.name ?? "—",
        productName: l.products?.name ?? "—",
        quantity: l.qty,
        unitCost: Number(l.unit_cost),
        totalCost: Number(l.line_total),
        status: l.purchase_orders!.status,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))

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
