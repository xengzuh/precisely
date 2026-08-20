import { renderToBuffer } from "@react-pdf/renderer"
import { InvoiceTemplate } from "@/components/pdf/InvoiceTemplate"
import { getUserContext } from "@/lib/erp/actions/context"
import { formatDate } from "@/lib/erp/format"
import { getInvoiceDetail, getOrganization } from "@/lib/erp/queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getUserContext()

    // getInvoiceDetail filters on org_id, so an id belonging to another tenant
    // comes back null rather than rendering someone else's invoice.
    const [invoice, org] = await Promise.all([getInvoiceDetail(ctx, id), getOrganization(ctx)])

    if (!invoice) return new Response("Invoice not found", { status: 404 })

    const pdfBuffer = await renderToBuffer(
      <InvoiceTemplate
        invoiceNo={invoice.invoice_no}
        issueDate={formatDate(invoice.issue_date, org)}
        dueDate={formatDate(invoice.due_date, org)}
        companyName={org.name}
        customerName={invoice.customer?.name ?? "—"}
        customerAddress={invoice.customer?.billing_address ?? null}
        customerTaxId={invoice.customer?.tax_id ?? null}
        lines={invoice.lines.map((l) => ({
          description: l.description,
          sku: l.productSku,
          qty: l.qty,
          uom: l.uom,
          unitPrice: l.unit_price,
          lineTotal: l.line_total,
        }))}
        subtotal={invoice.subtotal}
        tax={invoice.tax}
        taxLabel={org.tax_label}
        total={invoice.total}
        amountPaid={invoice.amount_paid}
        currency={invoice.currency}
        locale={org.locale}
      />
    )

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_no}.pdf"`,
      },
    })
  } catch (err) {
    console.error("[invoices/pdf]", err)
    return new Response("Failed to generate invoice", { status: 500 })
  }
}
