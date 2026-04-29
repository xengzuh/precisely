import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const ACCENT = "#1d4ed8"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const BG_LIGHT = "#f8fafc"
const BAR_BG = "#dbeafe"

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: "#111827" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  // Title section
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  period: { fontSize: 12, color: MUTED, marginTop: 2 },
  generated: { fontSize: 8, color: MUTED },
  accentLine: { height: 3, backgroundColor: ACCENT, marginVertical: 16 },
  // Summary cards
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
  summaryValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  // Table
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
  colQty: { width: 36, textAlign: "right" },
  colTotal: { width: 72, textAlign: "right" },
  colType: { width: 52 },
  typeSale: { color: ACCENT, fontFamily: "Helvetica-Bold" },
  typePurchase: { color: "#059669" },
  // Chart
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 10 },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  chartLabel: { width: 72, fontSize: 8, color: MUTED },
  chartBarBg: { flex: 1, height: 10, backgroundColor: BAR_BG, borderRadius: 2 },
  chartBar: { height: 10, backgroundColor: ACCENT, borderRadius: 2 },
  chartValue: { width: 72, fontSize: 8, textAlign: "right", color: MUTED },
  // Page number
  pageNum: {
    position: "absolute",
    bottom: 28,
    right: 48,
    fontSize: 9,
    color: MUTED,
  },
})

export type SalesTx = {
  date: string
  product: string
  quantity: number
  total: number
  type: string
}

export type DailyEntry = { date: string; revenue: number; count: number }

type Props = {
  period: string
  generatedAt: string
  transactions: SalesTx[]
  summary: {
    totalRevenue: number
    totalTransactions: number
    avgTransactionValue: number
    bestSelling: string
  }
  dailyData: DailyEntry[]
}

export function SalesReportTemplate({ period, generatedAt, transactions, summary, dailyData }: Props) {
  const maxRevenue = Math.max(...dailyData.map((d) => d.revenue), 1)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Title */}
        <View style={s.between}>
          <View>
            <Text style={s.title}>Sales Report</Text>
            <Text style={s.period}>{period}</Text>
          </View>
          <Text style={s.generated}>Generated {generatedAt}</Text>
        </View>
        <View style={s.accentLine} />

        {/* Summary cards */}
        <View style={s.summaryGrid}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total Revenue</Text>
            <Text style={s.summaryValue}>RM {summary.totalRevenue.toFixed(2)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Transactions</Text>
            <Text style={s.summaryValue}>{summary.totalTransactions}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Avg Value</Text>
            <Text style={s.summaryValue}>RM {summary.avgTransactionValue.toFixed(2)}</Text>
          </View>
          <View style={[s.summaryCard, { marginRight: 0 }]}>
            <Text style={s.summaryLabel}>Best Selling</Text>
            <Text style={[s.summaryValue, { fontSize: 9 }]}>{summary.bestSelling || "—"}</Text>
          </View>
        </View>

        {/* Transactions table */}
        <Text style={[s.sectionTitle, { marginBottom: 8 }]}>Transactions</Text>
        <View style={s.tableHeader}>
          <Text style={[s.colDate, s.headerText]}>Date</Text>
          <Text style={[s.colProduct, s.headerText]}>Product</Text>
          <Text style={[s.colQty, s.headerText]}>Qty</Text>
          <Text style={[s.colTotal, s.headerText]}>Total</Text>
          <Text style={[s.colType, s.headerText]}>Type</Text>
        </View>
        {transactions.map((tx, i) => (
          <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
            <Text style={s.colDate}>{tx.date}</Text>
            <Text style={s.colProduct}>{tx.product}</Text>
            <Text style={s.colQty}>{tx.quantity}</Text>
            <Text style={s.colTotal}>RM {tx.total.toFixed(2)}</Text>
            <Text style={[s.colType, tx.type === "sale" ? s.typeSale : s.typePurchase]}>
              {tx.type}
            </Text>
          </View>
        ))}

        {/* Daily breakdown chart */}
        {dailyData.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={s.sectionTitle}>Daily Revenue Breakdown</Text>
            {dailyData.map((d) => (
              <View key={d.date} style={s.chartRow}>
                <Text style={s.chartLabel}>{d.date}</Text>
                <View style={s.chartBarBg}>
                  <View style={[s.chartBar, { width: `${(d.revenue / maxRevenue) * 100}%` }]} />
                </View>
                <Text style={s.chartValue}>RM {d.revenue.toFixed(0)}</Text>
              </View>
            ))}
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
