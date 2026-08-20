"use client"

import dynamic from "next/dynamic"

export type { ChartEntry } from "./revenue-chart-inner"

/**
 * Client-only, because Recharts' ResponsiveContainer measures the DOM and
 * renders nothing meaningful on the server — rendering it in both places
 * produces a hydration mismatch.
 *
 * The previous version gated on a `mounted` flag set from an effect, which
 * works but costs a second render pass on every load and trips React's
 * set-state-in-effect rule. Skipping SSR for this subtree says the same thing
 * to the framework directly.
 */
export const RevenueChart = dynamic(
  () => import("./revenue-chart-inner").then((m) => m.RevenueChartInner),
  {
    ssr: false,
    loading: () => <div className="h-[200px]" />,
  }
)
