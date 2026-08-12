"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { sellProduct } from "@/app/(dashboard)/inventory/actions"
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
import { formatQty } from "@/lib/erp/uom"
import type { ProductListItem } from "@/lib/types"

// Quantities are decimal now — a sale of 12.5 kg is ordinary.
const schema = z.object({
  quantity: z.coerce.number().positive("Must be greater than 0"),
})
type Values = z.infer<typeof schema>

export function SellDialog({
  product,
  open,
  onOpenChange,
}: {
  product: ProductListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: { quantity: 1 },
  })

  useEffect(() => {
    if (open) form.reset({ quantity: 1 })
  }, [open, product?.id, form])

  const quantity = Number(form.watch("quantity")) || 0
  const total = quantity * Number(product?.list_price ?? 0)

  async function onSubmit(values: Values) {
    if (!product) return

    if (values.quantity > product.available) {
      form.setError("quantity", {
        message: `Only ${formatQty(product.available, product.base_uom)} available`,
      })
      return
    }

    try {
      await sellProduct(product.id, values.quantity)
      onOpenChange(false)
      toast.success("Sale recorded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!form.formState.isSubmitting) onOpenChange(o)
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sell — {product?.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium tabular-nums">
              {product ? formatQty(product.available, product.base_uom) : "—"}
            </span>
          </div>

          {product?.is_batch_tracked && (
            <p className="text-xs text-muted-foreground">
              Stock will be drawn from the earliest-expiring lot.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="sell-qty">
              Quantity{product ? ` (${product.base_uom})` : ""}
            </Label>
            <Input
              id="sell-qty"
              type="number"
              min="0"
              step="0.0001"
              autoFocus
              {...form.register("quantity")}
            />
            {form.formState.errors.quantity && (
              <p className="text-xs text-destructive">
                {form.formState.errors.quantity.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">RM {total.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={form.formState.isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Processing…
              </>
            ) : (
              "Confirm Sale"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
