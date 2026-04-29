"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, PlusCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addProduct } from "@/app/(dashboard)/inventory/actions"

const addProductSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z
    .string()
    .min(3, "SKU must be at least 3 characters")
    .regex(/^\S+$/, "SKU cannot contain spaces"),
  stock: z.coerce.number().int("Must be a whole number").min(0, "Must be 0 or more"),
  price: z.coerce.number().min(0.01, "Must be at least 0.01"),
})
type AddProductValues = z.infer<typeof addProductSchema>

const STEPS = ["Add Products", "Make a Sale", "View Reports"] as const

export function OnboardingWizard() {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)

  const form = useForm<AddProductValues>({
    resolver: zodResolver(addProductSchema) as Resolver<AddProductValues>,
    defaultValues: { name: "", sku: "" },
  })

  async function onSubmit(values: AddProductValues) {
    const fd = new FormData()
    fd.set("name", values.name)
    fd.set("sku", values.sku)
    fd.set("stock", String(values.stock))
    fd.set("price", String(values.price))
    try {
      await addProduct(fd)
      setAddOpen(false)
      form.reset()
      toast.success("Product added! Heading to your dashboard…")
      router.push("/dashboard")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add product")
    }
  }

  return (
    <div className="w-full max-w-lg space-y-8">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  i === 0 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px w-10 bg-border mx-2 mb-4 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Headline */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Let&apos;s set up your inventory
        </h1>
        <p className="text-muted-foreground text-sm">
          Most businesses are up and running in under 10 minutes
        </p>
      </div>

      {/* Option cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Import from CSV */}
        <Link
          href="/inventory/import"
          className="group flex flex-col items-center gap-4 rounded-xl border-2 p-6 text-center transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Upload className="size-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Import from CSV</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a spreadsheet of your existing products
            </p>
          </div>
        </Link>

        {/* Add manually */}
        <button
          type="button"
          className="group flex flex-col items-center gap-4 rounded-xl border-2 p-6 text-center transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
          onClick={() => setAddOpen(true)}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <PlusCircle className="size-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Add Manually</p>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your first product by hand to get started
            </p>
          </div>
        </button>
      </div>

      {/* Add Product dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!form.formState.isSubmitting) {
            setAddOpen(o)
            if (!o) form.reset()
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Your First Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ob-name">Name</Label>
              <Input
                id="ob-name"
                placeholder="e.g. Wireless Keyboard"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-sku">SKU</Label>
              <Input
                id="ob-sku"
                placeholder="e.g. WK-001"
                {...form.register("sku")}
              />
              {form.formState.errors.sku && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.sku.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ob-stock">Stock</Label>
                <Input
                  id="ob-stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...form.register("stock")}
                />
                {form.formState.errors.stock && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.stock.message}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ob-price">Price (RM)</Label>
                <Input
                  id="ob-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  {...form.register("price")}
                />
                {form.formState.errors.price && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={form.formState.isSubmitting}
              onClick={() => { setAddOpen(false); form.reset() }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={form.formState.isSubmitting}
              onClick={form.handleSubmit(onSubmit)}
            >
              {form.formState.isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> Saving…</>
              ) : (
                "Save & Continue"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
