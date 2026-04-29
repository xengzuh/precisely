"use client"

import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export function MonthlyReportButton() {
  function download() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const today = now.toISOString().slice(0, 10)
    const startDate = `${year}-${month}-01`
    const a = document.createElement("a")
    a.href = `/api/reports/sales?startDate=${startDate}&endDate=${today}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Button variant="outline" size="sm" onClick={download}>
      <FileDown className="size-4" />
      Monthly Report
    </Button>
  )
}
