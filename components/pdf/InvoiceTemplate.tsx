import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const ACCENT = "#1d4ed8"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const BG_LIGHT = "#f8fafc"

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: "#111827" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  right: { alignItems: "flex-end" },
  accentLine: { height: 3, backgroundColor: ACCENT, marginBottom: 24 },
  invoiceWord: { fontSize: 28, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  invoiceNum: { color: MUTED, marginTop: 4 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  companyContact: { color: MUTED, marginTop: 3 },
  metaLabel: { color: MUTED, width: 72 },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  clientName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  clientLine: { color: MUTED, marginTop: 2, maxWidth: 220 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  colName: { flex: 3 },
  colQty: { flex: 1.2, textAlign: "right" },
  colUnit: { flex: 1.2, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right" },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: MUTED },
  sku: { fontSize: 8, color: MUTED, marginTop: 1 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  totalLabel: { width: 110, color: MUTED, textAlign: "right", paddingRight: 12 },
  totalValue: { width: 90, textAlign: "right" },
  grandLabel: { width: 110, fontFamily: "Helvetica-Bold", textAlign: "right", paddingRight: 12 },
  grandValue: { width: 90, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 12 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { color: MUTED, fontSize: 9 },
})

export type InvoicePdfLine = {
  description: string
  sku: string | null
  qty: number
  uom: string
  unitPrice: number
  lineTotal: number
}

export type InvoicePdfProps = {
  invoiceNo: string
  issueDate: string
  dueDate: string
  companyName: string
  customerName: string
  customerAddress: string | null
  customerTaxId: string | null
  lines: InvoicePdfLine[]
  subtotal: number
  tax: number
  taxLabel: string
  total: number
  amountPaid: number
  currency: string
  locale: string
}

/**
 * The customer-facing invoice.
 *
 * Every figure is passed in, never recomputed here: the totals on the PDF must
 * be byte-for-byte the ones stored on the invoice row, or the document and the
 * ledger disagree about what was billed. Tax rate and currency come from the
 * organization for the same reason — a hard-coded 6% silently misbills the
 * moment the rate changes or the org sells across a border.
 */
export function InvoiceTemplate({
  invoiceNo,
  issueDate,
  dueDate,
  companyName,
  customerName,
  customerAddress,
  customerTaxId,
  lines,
  subtotal,
  tax,
  taxLabel,
  total,
  amountPaid,
  currency,
  locale,
}: InvoicePdfProps) {
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)

  const balance = total - amountPaid

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={[s.between, { marginBottom: 24 }]}>
          <View>
            <Text style={s.invoiceWord}>INVOICE</Text>
            <Text style={s.invoiceNum}>{invoiceNo}</Text>
          </View>
          <View style={s.right}>
            <Text style={s.companyName}>{companyName}</Text>
          </View>
        </View>

        <View style={s.accentLine} />

        <View style={[s.between, { marginBottom: 36 }]}>
          <View>
            <Text style={s.sectionLabel}>Bill To</Text>
            <Text style={s.clientName}>{customerName}</Text>
            {customerAddress && <Text style={s.clientLine}>{customerAddress}</Text>}
            {customerTaxId && <Text style={s.clientLine}>Tax ID: {customerTaxId}</Text>}
          </View>
          <View style={s.right}>
            <View style={[s.row, { marginBottom: 3 }]}>
              <Text style={s.metaLabel}>Issue Date</Text>
              <Text>{issueDate}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.metaLabel}>Due Date</Text>
              <Text>{dueDate}</Text>
            </View>
          </View>
        </View>

        <View style={s.tableHeader}>
          <Text style={[s.colName, s.headerText]}>Description</Text>
          <Text style={[s.colQty, s.headerText]}>Qty</Text>
          <Text style={[s.colUnit, s.headerText]}>Unit Price</Text>
          <Text style={[s.colTotal, s.headerText]}>Total</Text>
        </View>
        {lines.map((line, i) => (
          <View key={i} style={s.tableRow}>
            <View style={s.colName}>
              <Text>{line.description}</Text>
              {line.sku && <Text style={s.sku}>{line.sku}</Text>}
            </View>
            <Text style={s.colQty}>
              {line.qty} {line.uom}
            </Text>
            <Text style={s.colUnit}>{money(line.unitPrice)}</Text>
            <Text style={s.colTotal}>{money(line.lineTotal)}</Text>
          </View>
        ))}

        <View style={{ marginTop: 16 }}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{money(subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{taxLabel}</Text>
            <Text style={s.totalValue}>{money(tax)}</Text>
          </View>
          <View
            style={[
              s.totalRow,
              { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: BORDER, borderStyle: "solid" },
            ]}
          >
            <Text style={s.grandLabel}>Total</Text>
            <Text style={[s.grandValue, { color: ACCENT }]}>{money(total)}</Text>
          </View>

          {amountPaid > 0 && (
            <>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Paid</Text>
                <Text style={s.totalValue}>−{money(amountPaid)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.grandLabel}>Balance Due</Text>
                <Text style={s.grandValue}>{money(balance)}</Text>
              </View>
            </>
          )}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            {balance <= 0 ? "Paid in full — thank you" : `Payment due by ${dueDate}`}
          </Text>
          <Text style={s.footerText}>{companyName}</Text>
        </View>
      </Page>
    </Document>
  )
}
