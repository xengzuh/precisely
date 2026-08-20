"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useForm, type Resolver } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { saveCustomer } from "@/app/(dashboard)/customers/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CustomerRow } from "@/lib/types"

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.union([z.email("Enter a valid email address"), z.literal("")]),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  creditLimit: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  billingAddress: z.string().optional(),
  deliveryAddress: z.string().optional(),
})

type Values = z.infer<typeof schema>

/**
 * Create or edit a customer.
 *
 * Payment terms live here rather than on the invoice because
 * create_invoice_from_order reads them to set the due date — changing them
 * changes when every future invoice for this customer falls due.
 */
export function CustomerFormDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer?: CustomerRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    values: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      taxId: customer?.tax_id ?? "",
      paymentTermsDays: customer?.payment_terms_days ?? 30,
      creditLimit: customer?.credit_limit ?? "",
      billingAddress: customer?.billing_address ?? "",
      deliveryAddress: customer?.delivery_address ?? "",
    },
  })

  async function onSubmit(values: Values) {
    const fd = new FormData()
    if (customer) fd.set("customerId", customer.id)
    fd.set("name", values.name)
    fd.set("paymentTermsDays", String(values.paymentTermsDays))
    for (const key of ["email", "phone", "taxId", "billingAddress", "deliveryAddress"] as const) {
      if (values[key]) fd.set(key, values[key] as string)
    }
    if (values.creditLimit !== "" && values.creditLimit != null) {
      fd.set("creditLimit", String(values.creditLimit))
    }

    try {
      await saveCustomer(fd)
      onOpenChange(false)
      form.reset()
      toast.success(customer ? `${values.name} updated` : `${values.name} added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save customer")
    }
  }

  const err = form.formState.errors
  const busy = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cf-name">Name</Label>
            <Input id="cf-name" placeholder="e.g. Acme Coatings Sdn Bhd" {...form.register("name")} />
            {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-email">Email</Label>
              <Input id="cf-email" type="email" placeholder="orders@acme.com" {...form.register("email")} />
              {err.email && <p className="text-xs text-destructive">{err.email.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cf-phone">Phone</Label>
              <Input id="cf-phone" placeholder="+60 3 1234 5678" {...form.register("phone")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-terms">Terms (days)</Label>
              <Input id="cf-terms" type="number" min="0" max="180" {...form.register("paymentTermsDays")} />
              {err.paymentTermsDays && (
                <p className="text-xs text-destructive">{err.paymentTermsDays.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cf-credit">Credit limit</Label>
              <Input
                id="cf-credit"
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
                {...form.register("creditLimit")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cf-tax">Tax ID</Label>
              <Input id="cf-tax" placeholder="Optional" {...form.register("taxId")} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-billing">Billing address</Label>
            <Textarea id="cf-billing" rows={2} {...form.register("billingAddress")} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-delivery">Delivery address</Label>
            <Textarea
              id="cf-delivery"
              rows={2}
              placeholder="Leave blank if the same as billing"
              {...form.register("deliveryAddress")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={form.handleSubmit(onSubmit)}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
