"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { formatMoney, type OrgFormat } from "@/lib/erp/format"

export type ChartEntry = {
  date: string
  label: string
  revenue: number
}

/**
 * Colours come from the theme, never from hex literals — the app is themed
 * through CSS variables and a hard-coded blue ignores dark mode entirely.
 * Recharts needs real colour values rather than classes, so the variables are
 * referenced directly.
 */
export function RevenueChartInner({ data, org }: { data: ChartEntry[]; org: OrgFormat }) {
  const compact = new Intl.NumberFormat(org.locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  })

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compact.format(v)}
          width={56}
        />
        <Tooltip
          formatter={(value) => [formatMoney(Number(value), org), "Revenue"]}
          cursor={{ fill: "var(--muted)" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--popover-foreground)",
          }}
        />
        <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
