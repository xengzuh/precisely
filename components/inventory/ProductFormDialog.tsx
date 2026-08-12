"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Controller, useForm, type Resolver } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { addProduct } from "@/app/(dashboard)/inventory/actions"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    sku: z
      .string()
      .min(3, "SKU must be at least 3 characters")
      .regex(/^\S+$/, "SKU cannot contain spaces"),
    grade: z.string().optional(),
    concentrationPct: z.coerce.number().min(0).max(100).optional(),
    baseUom: z.enum(["kg", "L", "ea"]),
    densityKgPerL: z.coerce.number().positive("Must be greater than 0").optional(),
    costPrice: z.coerce.number().min(0, "Must be 0 or more"),
    listPrice: z.coerce.number().min(0, "Must be 0 or more"),
    reorderPoint: z.coerce.number().min(0).optional(),
    isBatchTracked: z.boolean(),
    openingQty: z.coerce.number().min(0, "Must be 0 or more"),
    openingLotCode: z.string().optional(),
  })
  .refine((v) => !(v.isBatchTracked && v.openingQty > 0 && !v.openingLotCode?.trim()), {
    message: "A lot code is required for opening stock on a batch-tracked product",
    path: ["openingLotCode"],
  })

type Values = z.infer<typeof schema>

/**
 * Add a product to the catalog.
 *
 * Density is what makes a product orderable in units other than the one it is
 * stocked in — a customer asking for 500 kg of a product held in litres can
 * only be served if this is set, so it is prompted for on every liquid.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      name: "",
      sku: "",
      grade: "",
      baseUom: "ea",
      costPrice: 0,
      listPrice: 0,
      isBatchTracked: false,
      openingQty: 0,
      openingLotCode: "",
    },
  })

  const baseUom = form.watch("baseUom")
  const isBatchTracked = form.watch("isBatchTracked")
  const isLiquidOrSolid = baseUom !== "ea"

  function close() {
    onOpenChange(false)
    form.reset()
  }

  async function onSubmit(values: Values) {
    const fd = new FormData()
    fd.set("name", values.name)
    fd.set("sku", values.sku)
    fd.set("baseUom", values.baseUom)
    fd.set("costPrice", String(values.costPrice))
    fd.set("listPrice", String(values.listPrice))
    fd.set("openingQty", String(values.openingQty))
    if (values.grade) fd.set("grade", values.grade)
    if (values.concentrationPct != null) {
      fd.set("concentrationPct", String(values.concentrationPct))
    }
    if (values.densityKgPerL != null) fd.set("densityKgPerL", String(values.densityKgPerL))
    if (values.reorderPoint != null) fd.set("reorderPoint", String(values.reorderPoint))
    if (values.isBatchTracked) fd.set("isBatchTracked", "on")
    if (values.openingLotCode) fd.set("openingLotCode", values.openingLotCode)

    try {
      await addProduct(fd)
      close()
      toast.success(`${values.sku} added to the catalog`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add product")
    }
  }

  const err = form.formState.errors

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!form.formState.isSubmitting) {
          onOpenChange(o)
          if (!o) form.reset()
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              placeholder="e.g. Isopropyl Alcohol 99%"
              {...form.register("name")}
            />
            {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-sku">SKU</Label>
              <Input id="ap-sku" placeholder="e.g. SOL-IPA-99" {...form.register("sku")} />
              {err.sku && <p className="text-xs text-destructive">{err.sku.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-grade">Grade</Label>
              <Input id="ap-grade" placeholder="e.g. Technical" {...form.register("grade")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-uom">Base unit</Label>
              <Controller
                control={form.control}
                name="baseUom"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v ?? "ea")}
                  >
                    <SelectTrigger id="ap-uom" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">Litres (L)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="ea">Each (ea)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-conc">Concentration (%)</Label>
              <Input
                id="ap-conc"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="e.g. 99"
                {...form.register("concentrationPct")}
              />
              {err.concentrationPct && (
                <p className="text-xs text-destructive">{err.concentrationPct.message}</p>
              )}
            </div>
          </div>

          {isLiquidOrSolid && (
            <div className="grid gap-1.5">
              <Label htmlFor="ap-density">Density (kg/L)</Label>
              <Input
                id="ap-density"
                type="number"
                min="0"
                step="0.00001"
                placeholder="e.g. 0.786"
                {...form.register("densityKgPerL")}
              />
              <p className="text-xs text-muted-foreground">
                Needed to accept orders in kg for a product stocked in L, and vice versa.
              </p>
              {err.densityKgPerL && (
                <p className="text-xs text-destructive">{err.densityKgPerL.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-cost">Cost price</Label>
              <Input
                id="ap-cost"
                type="number"
                min="0"
                step="0.0001"
                {...form.register("costPrice")}
              />
              {err.costPrice && (
                <p className="text-xs text-destructive">{err.costPrice.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-list">List price</Label>
              <Input
                id="ap-list"
                type="number"
                min="0"
                step="0.0001"
                {...form.register("listPrice")}
              />
              {err.listPrice && (
                <p className="text-xs text-destructive">{err.listPrice.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-reorder">Reorder point</Label>
              <Input
                id="ap-reorder"
                type="number"
                min="0"
                step="0.0001"
                placeholder="Optional"
                {...form.register("reorderPoint")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-opening">Opening stock</Label>
              <Input
                id="ap-opening"
                type="number"
                min="0"
                step="0.0001"
                {...form.register("openingQty")}
              />
              {err.openingQty && (
                <p className="text-xs text-destructive">{err.openingQty.message}</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
              {...form.register("isBatchTracked")}
            />
            Track batches and expiry dates
          </label>

          {isBatchTracked && (
            <div className="grid gap-1.5">
              <Label htmlFor="ap-lot">Opening lot code</Label>
              <Input
                id="ap-lot"
                placeholder="e.g. IPA-2601-A"
                {...form.register("openingLotCode")}
              />
              {err.openingLotCode && (
                <p className="text-xs text-destructive">{err.openingLotCode.message}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={form.formState.isSubmitting}
            onClick={close}
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
