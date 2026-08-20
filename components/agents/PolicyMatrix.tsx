"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { savePolicy } from "@/app/(dashboard)/agents/policies/actions"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AutonomyMode } from "@/types/database"

export type PolicyRowModel = {
  action: string
  description: string
  risk: string
  mode: AutonomyMode
  threshold: number | null
  /** true when no stored policy exists and this is the action's own default */
  isDefault: boolean
}

/**
 * The per-action autonomy matrix.
 *
 * Every row is a decision about what an agent may do unattended. A threshold
 * only applies in `auto` mode — above it, the action queues for approval
 * regardless — and high-risk actions are always gated whatever this says, so
 * setting one to `auto` widens nothing on its own.
 */
export function PolicyMatrix({ policies }: { policies: PolicyRowModel[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead className="hidden lg:table-cell">What it does</TableHead>
            <TableHead className="w-40">Mode</TableHead>
            <TableHead className="w-40">Auto below</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <PolicyRow key={policy.action} policy={policy} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PolicyRow({ policy }: { policy: PolicyRowModel }) {
  const router = useRouter()
  const [mode, setMode] = useState<AutonomyMode>(policy.mode)
  const [threshold, setThreshold] = useState(
    policy.threshold === null ? "" : String(policy.threshold)
  )
  const [saving, setSaving] = useState(false)

  async function persist(nextMode: AutonomyMode, nextThreshold: string) {
    setSaving(true)
    try {
      await savePolicy({
        action: policy.action,
        mode: nextMode,
        thresholdAmount: nextThreshold === "" ? null : Number(nextThreshold),
      })
      toast.success(`${policy.action} set to ${nextMode}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save policy")
    } finally {
      setSaving(false)
    }
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-xs font-medium">{policy.action}</span>
        <span className="mt-1 flex items-center gap-1.5">
          <Badge variant={policy.risk === "high" ? "destructive" : "outline"}>
            {policy.risk}
          </Badge>
          {policy.isDefault && <Badge variant="outline">default</Badge>}
        </span>
      </TableCell>

      <TableCell className="hidden max-w-md text-xs text-muted-foreground lg:table-cell">
        {policy.description}
      </TableCell>

      <TableCell>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = (v ?? "approve") as AutonomyMode
            setMode(next)
            void persist(next, threshold)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="approve">Ask first</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="No limit"
            value={threshold}
            disabled={mode !== "auto"}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => {
              const stored = policy.threshold === null ? "" : String(policy.threshold)
              if (threshold !== stored) void persist(mode, threshold)
            }}
          />
          {saving && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
      </TableCell>
    </TableRow>
  )
}
