"use client"

import { Pencil } from "lucide-react"
import { useState } from "react"
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog"
import { Button } from "@/components/ui/button"
import type { CustomerRow } from "@/lib/types"

/** Just the edit affordance — the detail page itself stays a server component. */
export function CustomerHeader({ customer }: { customer: CustomerRow }) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Edit
        </Button>
      </div>

      <CustomerFormDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
