import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const ACCENT = "#1d4ed8"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const BG_LIGHT = "#f8fafc"
const AMBER_BG = "#fef3c7"
const AMBER_TEXT = "#92400e"
const AMBER_BORDER = "#fcd34d"

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: "#111827" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 11, color: MUTED, marginTop: 2 },
  generated: { fontSize: 8, color: MUTED },
  accentLine: { height: 3, backgroundColor: ACCENT, marginVertical: 16 },
  // Summary
  summaryGrid: { flexDirection: "row", marginBottom: 24 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 10,
    marginRight: 8,
  },
  summaryLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  // Table
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 8 },
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
  lowStockRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: AMBER_BORDER,
    borderStyle: "solid",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: AMBER_BG,
  },
  lowStockText: { color: AMBER_TEXT },
  colName: { flex: 3 },
  colSku: { flex: 2 },
  colStock: { width: 52, textAlign: "right" },
  colPrice: { width: 72, textAlign: "right" },
  colValue: { width: 80, textAlign: "right" },
  pageNum: {
    position: "absolute",
    bottom: 28,
    right: 48,
    fontSize: 9,
    color: MUTED,
  },
})

type ProductRow = {
  name: string
  sku: string
  stock: number
  price: number
  totalValue: number
}

type Props = {
  date: string
  generatedAt: string
  products: ProductRow[]
}

export function InventoryReportTemplate({ date, generatedAt, products }: Props) {
  const totalStockValue = products.reduce((s, p) => s + p.totalValue, 0)
  const lowStockItems = products.filter((p) => p.stock < 10)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Title */}
        <View style={s.between}>
          <View>
            <Text style={s.title}>Inventory Report</Text>
            <Text style={s.subtitle}>{date}</Text>
          </View>
          <Text style={s.generated}>Generated {generatedAt}</Text>
        </View>
        <View style={s.accentLine} />

        {/* Summary */}
        <View style={s.summaryGrid}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total Products</Text>
            <Text style={s.summaryValue}>{products.length}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total Stock Value</Text>
            <Text style={s.summaryValue}>RM {totalStockValue.toFixed(2)}</Text>
          </View>
          <View style={[s.summaryCard, { marginRight: 0 }]}>
            <Text style={s.summaryLabel}>Low Stock Items</Text>
            <Text style={[s.summaryValue, lowStockItems.length > 0 ? { color: "#d97706" } : {}]}>
              {lowStockItems.length}
            </Text>
          </View>
        </View>

        {/* Products table */}
        <Text style={s.sectionTitle}>All Products</Text>
        <View style={s.tableHeader}>
          <Text style={[s.colName, s.headerText]}>Name</Text>
          <Text style={[s.colSku, s.headerText]}>SKU</Text>
          <Text style={[s.colStock, s.headerText]}>Stock</Text>
          <Text style={[s.colPrice, s.headerText]}>Unit Price</Text>
          <Text style={[s.colValue, s.headerText]}>Total Value</Text>
        </View>
        {products.map((p, i) => (
          <View
            key={i}
            style={p.stock < 10 ? s.lowStockRow : [s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}
          >
            <Text style={[s.colName, p.stock < 10 ? s.lowStockText : {}]}>{p.name}</Text>
            <Text style={[s.colSku, p.stock < 10 ? s.lowStockText : {}]}>{p.sku}</Text>
            <Text style={[s.colStock, p.stock < 10 ? s.lowStockText : {}]}>{p.stock}</Text>
            <Text style={[s.colPrice, p.stock < 10 ? s.lowStockText : {}]}>
              RM {p.price.toFixed(2)}
            </Text>
            <Text style={[s.colValue, p.stock < 10 ? s.lowStockText : {}]}>
              RM {p.totalValue.toFixed(2)}
            </Text>
          </View>
        ))}

        {/* Low stock summary */}
        {lowStockItems.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={s.sectionTitle}>Low Stock Alert</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: AMBER_BORDER,
                borderStyle: "solid",
                borderRadius: 4,
                backgroundColor: AMBER_BG,
                padding: 12,
              }}
            >
              {lowStockItems.map((p, i) => (
                <View key={i} style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
                  <Text style={s.lowStockText}>{p.name} ({p.sku})</Text>
                  <Text style={[s.lowStockText, { fontFamily: "Helvetica-Bold" }]}>
                    {p.stock} units remaining
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

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
