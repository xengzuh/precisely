import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"

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
  // Header
  invoiceWord: { fontSize: 28, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  invoiceNum: { color: MUTED, marginTop: 4 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  companyContact: { color: MUTED, marginTop: 3 },
  // Meta
  metaLabel: { color: MUTED, width: 72 },
  // Bill To
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  clientName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 0,
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
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: MUTED },
  // Totals
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  totalLabel: { width: 100, color: MUTED },
  totalValue: { width: 80, textAlign: "right" },
  grandLabel: { width: 100, fontFamily: "Helvetica-Bold" },
  grandValue: { width: 80, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 12 },
  // Footer
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

type LineItem = { name: string; quantity: number; unitPrice: number }

type Props = {
  invoiceNumber: string
  issuedDate: string
  dueDate: string
  clientName: string
  items: LineItem[]
  companyName?: string
  companyContact?: string
}

export function InvoiceTemplate({
  invoiceNumber,
  issuedDate,
  dueDate,
  clientName,
  items,
  companyName = "Your Company",
  companyContact = "contact@yourcompany.com",
}: Props) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const sst = subtotal * 0.06
  const grandTotal = subtotal + sst

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={[s.between, { marginBottom: 24 }]}>
          <View>
            <Text style={s.invoiceWord}>INVOICE</Text>
            <Text style={s.invoiceNum}>{invoiceNumber}</Text>
          </View>
          <View style={s.right}>
            <Image src="/logo.svg" style={{ width: 120, height: 36, objectFit: "contain", marginBottom: 4 }} />
            <Text style={s.companyContact}>{companyContact}</Text>
          </View>
        </View>

        <View style={s.accentLine} />

        {/* Dates + Bill To */}
        <View style={[s.between, { marginBottom: 36 }]}>
          <View>
            <Text style={s.sectionLabel}>Bill To</Text>
            <Text style={s.clientName}>{clientName}</Text>
          </View>
          <View style={s.right}>
            <View style={[s.row, { marginBottom: 3 }]}>
              <Text style={s.metaLabel}>Issue Date</Text>
              <Text>{issuedDate}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.metaLabel}>Due Date</Text>
              <Text>{dueDate}</Text>
            </View>
          </View>
        </View>

        {/* Line items table */}
        <View style={s.tableHeader}>
          <Text style={[s.colName, s.headerText]}>Description</Text>
          <Text style={[s.colQty, s.headerText]}>Qty</Text>
          <Text style={[s.colUnit, s.headerText]}>Unit Price</Text>
          <Text style={[s.colTotal, s.headerText]}>Total</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={s.colName}>{item.name}</Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colUnit}>RM {item.unitPrice.toFixed(2)}</Text>
            <Text style={s.colTotal}>RM {(item.quantity * item.unitPrice).toFixed(2)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={{ marginTop: 16 }}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>RM {subtotal.toFixed(2)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>SST (6%)</Text>
            <Text style={s.totalValue}>RM {sst.toFixed(2)}</Text>
          </View>
          <View style={[s.totalRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: BORDER, borderStyle: "solid" }]}>
            <Text style={s.grandLabel}>Grand Total</Text>
            <Text style={[s.grandValue, { color: ACCENT }]}>RM {grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Thank you for your business</Text>
          <Text style={s.footerText}>{companyContact}</Text>
        </View>
      </Page>
    </Document>
  )
}
