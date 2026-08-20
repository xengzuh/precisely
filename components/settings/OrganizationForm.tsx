"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { saveOrganization } from "@/app/(dashboard)/settings/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/erp/format"
import type { OrganizationRow } from "@/lib/types"

/**
 * The business constants the rest of the app reads.
 *
 * The tax rate is stored as a fraction but entered as a percentage — asking
 * someone to type 0.06 for 6% is how you end up with a 600% tax rate.
 */
export function OrganizationForm({ org }: { org: OrganizationRow }) {
  const router = useRouter()
  const [name, setName] = useState(org.name)
  const [currency, setCurrency] = useState(org.currency)
  const [taxPct, setTaxPct] = useState(String(org.tax_rate * 100))
  const [taxLabel, setTaxLabel] = useState(org.tax_label)
  const [locale, setLocale] = useState(org.locale)
  const [saving, setSaving] = useState(false)

  const pctNum = Number(taxPct)
  const previewValid = Number.isFinite(pctNum) && currency.length === 3 && locale.length >= 2

  async function save() {
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
      return toast.error("Tax rate must be between 0 and 100")
    }

    setSaving(true)
    try {
      await saveOrganization({
        name: name.trim(),
        currency: currency.trim(),
        taxRate: pctNum / 100,
        taxLabel: taxLabel.trim(),
        locale: locale.trim(),
      })
      toast.success("Settings saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4 pt-4">
        <div className="grid gap-1.5">
          <Label htmlFor="org-name">Organization name</Label>
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">Printed on every invoice.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="org-currency">Currency</Label>
            <Input
              id="org-currency"
              maxLength={3}
              placeholder="MYR"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-locale">Locale</Label>
            <Input
              id="org-locale"
              placeholder="en-MY"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="org-tax-label">Tax name</Label>
            <Input
              id="org-tax-label"
              placeholder="SST"
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-tax-rate">Tax rate (%)</Label>
            <Input
              id="org-tax-rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="mt-1">
            {previewValid ? (
              <>
                {formatMoney(1234.5, { currency, locale })} · {taxLabel} at {pctNum}%
              </>
            ) : (
              <span className="text-muted-foreground">Enter a valid currency and locale</span>
            )}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Changing the tax rate affects orders raised from now on. Totals already stored on past
          orders and invoices stay as they were issued.
        </p>

        <div>
          <Button disabled={saving} onClick={save}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
