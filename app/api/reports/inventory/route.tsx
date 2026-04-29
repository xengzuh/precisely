import { renderToBuffer } from "@react-pdf/renderer"
import { format } from "date-fns"
import { getSupabase } from "@/lib/supabase/server"
import { InventoryReportTemplate } from "@/components/pdf/InventoryReportTemplate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response("Unauthorized", { status: 401 })

    const { data, error } = await supabase
      .from("products")
      .select("name, sku, stock, price")
      .order("name")

    if (error) return new Response(error.message, { status: 500 })

    type RawProduct = { name: string; sku: string; stock: number; price: number }
    const raw = (data ?? []) as RawProduct[]

    const products = raw.map((p) => ({
      name: p.name,
      sku: p.sku,
      stock: p.stock,
      price: Number(p.price),
      totalValue: p.stock * Number(p.price),
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
