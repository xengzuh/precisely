"use client"

import { useState, useCallback } from "react"
import {
  ScanLine,
  CheckCircle2,
  Loader2,
  ShoppingCart,
  PackagePlus,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BarcodeScanner } from "@/components/barcode-scanner/BarcodeScanner"
import {
  getProductBySku,
  sellProduct,
  quickStockIn,
} from "@/app/(dashboard)/inventory/actions"
import { formatQty } from "@/lib/erp/uom"
import type { ProductListItem } from "@/lib/types"

type Phase =
  | "scanning"
  | "found"
  | "processing-sale"
  | "processing-purchase"
  | "success-sale"
  | "success-purchase"

export default function ScannerPage() {
  const [scanKey, setScanKey] = useState(0)
  const [product, setProduct] = useState<ProductListItem | null>(null)
  const [phase, setPhase] = useState<Phase>("scanning")

  const resetScan = useCallback(() => {
    setProduct(null)
    setPhase("scanning")
    setScanKey((k) => k + 1)
  }, [])

  const handleScan = useCallback(async (sku: string) => {
    const found = await getProductBySku(sku)
    if (!found) {
      toast.error(`No product found for SKU: ${sku}`)
      setScanKey((k) => k + 1)
      return
    }
    setProduct(found)
    setPhase("found")
  }, [])

  async function handleRecordSale() {
    if (!product) return
    setPhase("processing-sale")
    try {
      await sellProduct(product.id, 1)
      setPhase("success-sale")
      setTimeout(resetScan, 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed")
      setPhase("found")
    }
  }

  async function handleRecordPurchase() {
    if (!product) return
    setPhase("processing-purchase")
    try {
      await quickStockIn(product.id)
      setPhase("success-purchase")
      setTimeout(resetScan, 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stock update failed")
      setPhase("found")
    }
  }

  const isProcessing =
    phase === "processing-sale" || phase === "processing-purchase"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="size-5" />
        <h1 className="text-xl font-semibold">Scanner</h1>
      </div>

      {phase === "scanning" && (
        <>
          <BarcodeScanner key={scanKey} onScan={handleScan} onClose={resetScan} />
          <p className="text-center text-sm text-muted-foreground">
            Scan a product barcode to begin
          </p>
        </>
      )}

      {(phase === "found" || isProcessing) && product && (
        <div className="space-y-4">
          {/* Product info card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <p className="font-semibold text-base">{product.name}</p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                {product.sku}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatQty(product.available, product.base_uom)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="text-2xl font-semibold tabular-nums">
                  RM {Number(product.list_price).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="outline"
              className="h-16 flex-col gap-1"
              disabled={isProcessing || product.available <= 0}
              onClick={handleRecordSale}
            >
              {phase === "processing-sale" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="size-5" />
                  <span className="text-sm">Record Sale</span>
                </>
              )}
            </Button>
            <Button
              size="lg"
              className="h-16 flex-col gap-1"
              disabled={isProcessing}
              onClick={handleRecordPurchase}
            >
              {phase === "processing-purchase" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <PackagePlus className="size-5" />
                  <span className="text-sm">Stock In</span>
                </>
              )}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={isProcessing}
            onClick={resetScan}
          >
            Scan a different product
          </Button>
        </div>
      )}

      {(phase === "success-sale" || phase === "success-purchase") && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-in fade-in zoom-in duration-300">
          <CheckCircle2 className="size-20 text-green-500" />
          <div>
            <p className="font-semibold text-lg">
              {phase === "success-sale" ? "Sale Recorded!" : "Stock Updated!"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === "success-sale"
                ? `1 × ${product?.name} sold`
                : `+1 unit added to ${product?.name}`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
