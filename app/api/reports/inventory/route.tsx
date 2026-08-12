import { renderToBuffer } from "@react-pdf/renderer"
import { format } from "date-fns"
import { InventoryReportTemplate } from "@/components/pdf/InventoryReportTemplate"
import { getUserContext } from "@/lib/erp/actions/context"
import { listProducts } from "@/lib/erp/queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const ctx = await getUserContext()
    const raw = await listProducts(ctx)

    const products = raw.map((p) => ({
      name: p.name,
      sku: p.sku,
      stock: p.available,
      // Stock is valued at cost. Valuing it at the price you hope to sell for
      // overstates the asset — the previous report used the sell price.
      price: Number(p.cost_price),
      totalValue: p.available * Number(p.cost_price),
    }))

    const date = format(new Date(), "dd MMM yyyy")
    const generatedAt = format(new Date(), "dd MMM yyyy, HH:mm")

    const pdfBuffer = await renderToBuffer(
      <InventoryReportTemplate date={date} generatedAt={generatedAt} products={products} />
    )

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="inventory-report-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
      },
    })
  } catch (err) {
    console.error("[reports/inventory]", err)
    return new Response("Failed to generate report", { status: 500 })
  }
}
