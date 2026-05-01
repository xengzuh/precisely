"use client"

import Link from "next/link"
import { Download, ShoppingCart } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type SaleRow = {
  id: string
  quantity: number
  total_price: number
  type: string
  created_at: string
  products: { name: string } | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })
}

function exportCsv(rows: SaleRow[], filename: string) {
  const header = "Date,Product Name,Quantity,Total Price,Type"
  const lines = rows.map((r) =>
    [
      `"${fmtDate(r.created_at)}"`,
      `"${r.products?.name ?? ""}"`,
      r.quantity,
      Number(r.total_price).toFixed(2),
      r.type,
    ].join(",")
  )
  const csv = [header, ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function TransactionTable({ rows, emptyLabel }: { rows: SaleRow[]; emptyLabel: string }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-14">
                <div className="flex flex-col items-center gap-3 text-center">
                  <ShoppingCart className="size-10 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No {emptyLabel} yet</p>
                    <p className="text-xs text-muted-foreground">
                      {emptyLabel === "sales"
                        ? "Sell items from the Inventory page to see them here."
                        : "Purchase orders will appear here once recorded."}
                    </p>
                  </div>
                  <Link
                    href="/inventory"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Go to Inventory
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.products?.name ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                RM {Number(row.total_price).toFixed(2)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {fmtDate(row.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SalesTable({ rows }: { rows: SaleRow[] }) {
  const sales = rows.filter((r) => r.type === "sale")
  const purchases = rows.filter((r) => r.type === "purchase")

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <Tabs defaultValue="sales">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="sales">
              Sales
              {sales.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                  {sales.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="purchases">
              Purchases
              {purchases.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                  {purchases.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

        </div>

        <TabsContent value="sales" className="mt-4 space-y-3">
          {sales.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportCsv(sales, "sales.csv")}>
                <Download className="size-4" />
                Export CSV
              </Button>
            </div>
          )}
          <TransactionTable rows={sales} emptyLabel="sales" />
        </TabsContent>

        <TabsContent value="purchases" className="mt-4 space-y-3">
          {purchases.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportCsv(purchases, "purchases.csv")}>
                <Download className="size-4" />
                Export CSV
              </Button>
            </div>
          )}
          <TransactionTable rows={purchases} emptyLabel="purchases" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
