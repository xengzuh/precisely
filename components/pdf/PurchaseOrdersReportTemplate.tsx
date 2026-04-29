import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const ACCENT = "#1d4ed8"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const BG_LIGHT = "#f8fafc"
const GREEN = "#059669"

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: "#111827" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 11, color: MUTED, marginTop: 2 },
  generated: { fontSize: 8, color: MUTED },
  accentLine: { height: 3, backgroundColor: ACCENT, marginVertical: 16 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 6, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRowAlt: { backgroundColor: "#fafafa" },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED },
  colDate: { width: 70 },
  colProduct: { flex: 3 },
  colQty: { width: 40, textAlign: "right" },
  colCost: { width: 72, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  colStatus: { width: 60 },
  statusReceived: { color: GREEN, fontFamily: "Helvetica-Bold" },
  statusPending: { color: "#d97706" },
  supplierHeader: {
    backgroundColor: ACCENT,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 12,
    marginBottom: 0,
  },
  supplierName: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 10 },
  pageNum: {
    position: "absolute",
    bottom: 28,
    right: 48,
    fontSize: 9,
    color: MUTED,
  },
})

export type PORow = {
  date: string
  supplierName: string
  productName: string
  quantity: number
  unitCost: number
  totalCost: number
  status: string
}

type Props = {
  period: string
  generatedAt: string
  orders: PORow[]
}

export function PurchaseOrdersReportTemplate({ period, generatedAt, orders }: Props) {
  const totalSpend = orders.reduce((s, o) => s + o.totalCost, 0)

  // Group by supplier
  const grouped = new Map<string, PORow[]>()
  for (const order of orders) {
    const key = order.supplierName || "Unknown Supplier"
    const existing = grouped.get(key) ?? []
    grouped.set(key, [...existing, order])
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Title */}
        <View style={s.between}>
          <View>
            <Text style={s.title}>Purchase Orders</Text>
            <Text style={s.subtitle}>{period}</Text>
          </View>
          <Text style={s.generated}>Generated {generatedAt}</Text>
        </View>
        <View style={s.accentLine} />

        {/* Summary */}
        <View style={[s.row, { marginBottom: 24 }]}>
          <View style={{
            flex: 1,
            borderWidth: 1,
            borderColor: BORDER,
            borderStyle: "solid",
            borderRadius: 4,
            padding: 10,
            marginRight: 8,
          }}>
            <Text style={{ fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Total Orders</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{orders.length}</Text>
          </View>
          <View style={{
            flex: 1,
            borderWidth: 1,
            borderColor: BORDER,
            borderStyle: "solid",
            borderRadius: 4,
            padding: 10,
            marginRight: 8,
          }}>
            <Text style={{ fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Suppliers</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{grouped.size}</Text>
          </View>
          <View style={{
            flex: 1,
            borderWidth: 1,
            borderColor: BORDER,
            borderStyle: "solid",
            borderRadius: 4,
            padding: 10,
          }}>
            <Text style={{ fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Total Spend</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>RM {totalSpend.toFixed(2)}</Text>
          </View>
        </View>

        {/* Grouped orders */}
        {Array.from(grouped.entries()).map(([supplier, supplierOrders]) => (
          <View key={supplier}>
            <View style={s.supplierHeader}>
              <Text style={s.supplierName}>{supplier}</Text>
            </View>
            <View style={s.tableHeader}>
              <Text style={[s.colDate, s.headerText]}>Date</Text>
              <Text style={[s.colProduct, s.headerText]}>Product</Text>
              <Text style={[s.colQty, s.headerText]}>Qty</Text>
              <Text style={[s.colCost, s.headerText]}>Unit Cost</Text>
              <Text style={[s.colTotal, s.headerText]}>Total</Text>
              <Text style={[s.colStatus, s.headerText]}>Status</Text>
            </View>
            {supplierOrders.map((o, i) => (
              <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                <Text style={s.colDate}>{o.date}</Text>
                <Text style={s.colProduct}>{o.productName}</Text>
                <Text style={s.colQty}>{o.quantity}</Text>
                <Text style={s.colCost}>RM {o.unitCost.toFixed(2)}</Text>
                <Text style={s.colTotal}>RM {o.totalCost.toFixed(2)}</Text>
                <Text style={[s.colStatus, o.status === "received" ? s.statusReceived : s.statusPending]}>
                  {o.status}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* Page number */}
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
