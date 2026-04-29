"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { CSVImporter } from "@/components/csv-import/CSVImporter"
import { ColumnMapper } from "@/components/csv-import/ColumnMapper"
import { runImport } from "./actions"
import type { ImportResult } from "@/lib/csv-import/importProducts"

type Step = "upload" | "map" | "done"

const SAMPLE_CSV = `Name,SKU,Stock,Price
Wireless Keyboard,WK-001,50,79.90
USB Mouse,UM-001,100,29.90
HDMI Cable,HC-001,200,15.90`

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "sample-products.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function handleParsed(h: string[], r: Record<string, string>[]) {
    setHeaders(h)
    setRows(r)
    setStep("map")
  }

  async function handleImport(mappedRows: { name: string; sku: string; stock: number; price: number }[]) {
    setIsImporting(true)
    try {
      const res = await runImport(mappedRows)
      setResult(res)
      setStep("done")
    } catch (err) {
      setResult({
        imported: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Import failed"],
      })
      setStep("done")
    } finally {
      setIsImporting(false)
    }
  }

  function handleReset() {
    setStep("upload")
    setHeaders([])
    setRows([])
    setResult(null)
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label="Back to inventory"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-xl font-semibold">Import Products from CSV</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-10">
          Upload your existing product list and we&apos;ll set everything up automatically.
        </p>
      </div>

      {/* Download sample */}
      {step === "upload" && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={downloadSample}
          className="gap-2"
        >
          <Download className="size-4" />
          Download Sample CSV
        </Button>
      )}

      {/* Step content */}
      {step === "upload" && (
        <CSVImporter
          onParsed={handleParsed}
          onCancel={() => router.push("/inventory")}
        />
      )}

      {step === "map" && (
        <ColumnMapper
          headers={headers}
          rows={rows}
          onImport={handleImport}
          onBack={() => setStep("upload")}
          isImporting={isImporting}
        />
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          {/* Success */}
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800 text-sm">
                {result.imported} product{result.imported !== 1 ? "s" : ""} imported successfully
              </p>
            </div>
          </div>

          {/* Skipped */}
          {result.skipped > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <span className="font-medium">{result.skipped} product{result.skipped !== 1 ? "s" : ""} skipped</span>
                {" "}— duplicate SKU already in your inventory
              </p>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="size-4 text-destructive shrink-0" />
                <p className="text-sm font-medium text-destructive">
                  {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                </p>
              </div>
              <ul className="space-y-1 pl-6 list-disc text-xs text-destructive/80">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              type="button"
              className="flex-1"
              onClick={handleReset}
            >
              Import Another File
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => router.push("/inventory")}
            >
              View Inventory
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
