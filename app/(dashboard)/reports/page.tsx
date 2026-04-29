"use client"

import { useState } from "react"
import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function triggerDownload(url: string) {
  const a = document.createElement("a")
  a.href = url
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function DateRangeInputs({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input type="date" value={end} onChange={(e) => onEndChange(e.target.value)} />
      </div>
    </div>
  )
}

export default function ReportsPage() {
  // Sales report
  const [salesStart, setSalesStart] = useState(firstOfMonthStr())
  const [salesEnd, setSalesEnd] = useState(todayStr())
  const [salesLoading, setSalesLoading] = useState(false)

  // Purchase orders report
  const [poStart, setPoStart] = useState(firstOfMonthStr())
  const [poEnd, setPoEnd] = useState(todayStr())
  const [poLoading, setPoLoading] = useState(false)

  const [invLoading, setInvLoading] = useState(false)

  async function downloadSalesReport() {
    setSalesLoading(true)
    try {
      triggerDownload(`/api/reports/sales?startDate=${salesStart}&endDate=${salesEnd}`)
    } finally {
      setTimeout(() => setSalesLoading(false), 1500)
    }
  }

  async function downloadInventoryReport() {
    setInvLoading(true)
    try {
      triggerDownload("/api/reports/inventory")
    } finally {
      setTimeout(() => setInvLoading(false), 1500)
    }
  }

  async function downloadPoReport() {
    setPoLoading(true)
    try {
      triggerDownload(`/api/reports/purchase-orders?startDate=${poStart}&endDate=${poEnd}`)
    } finally {
      setTimeout(() => setPoLoading(false), 1500)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales Report */}
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div>
              <p className="font-semibold">Sales Report</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Revenue, transactions, and daily breakdown
              </p>
            </div>
            <DateRangeInputs
              start={salesStart}
              end={salesEnd}
              onStartChange={setSalesStart}
              onEndChange={setSalesEnd}
            />
            <Button
              className="w-full"
              onClick={downloadSalesReport}
              disabled={salesLoading || !salesStart || !salesEnd}
            >
              <FileDown className="size-4" />
              {salesLoading ? "Generating…" : "Download PDF"}
            </Button>
          </CardContent>
        </Card>

        {/* Inventory Report */}
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div>
              <p className="font-semibold">Inventory Report</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current stock levels and total value
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Snapshot of your inventory as of today.
            </p>
            <Button
              className="w-full"
              onClick={downloadInventoryReport}
              disabled={invLoading}
            >
              <FileDown className="size-4" />
              {invLoading ? "Generating…" : "Download PDF"}
            </Button>
          </CardContent>
        </Card>

        {/* Purchase Orders Report */}
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div>
              <p className="font-semibold">Purchase Orders Report</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Orders grouped by supplier
              </p>
            </div>
            <DateRangeInputs
              start={poStart}
              end={poEnd}
              onStartChange={setPoStart}
              onEndChange={setPoEnd}
            />
            <Button
              className="w-full"
              onClick={downloadPoReport}
              disabled={poLoading || !poStart || !poEnd}
            >
              <FileDown className="size-4" />
              {poLoading ? "Generating…" : "Download PDF"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
