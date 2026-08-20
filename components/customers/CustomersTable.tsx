"use client"

import { Plus, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney, type OrgFormat } from "@/lib/erp/format"
import type { CustomerListItem } from "@/lib/types"

export function CustomersTable({
  customers,
  org,
}: {
  customers: CustomerListItem[]
  org: OrgFormat
}) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add Customer
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
            <Users className="size-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No customers yet</p>
              <p className="text-xs text-muted-foreground">
                Add one to start raising sales orders.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add Customer
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Terms</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                // Over the credit limit is the one thing on this screen that
                // should stop someone taking another order.
                const overLimit = c.credit_limit !== null && c.outstanding > c.credit_limit
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {c.email ?? c.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {c.payment_terms_days}d
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${overLimit ? "font-semibold text-destructive" : ""}`}
                    >
                      {formatMoney(c.outstanding, org)}
                      {overLimit && (
                        <span className="block text-xs font-normal">over credit limit</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
