import { describe, expect, it } from "vitest"
import { shouldGate, type ResolvedPolicy } from "@/lib/erp/actions/run"
import { roleAtLeast } from "@/lib/erp/actions/types"

/**
 * The gate that decides whether an agent acts alone.
 *
 * Every case here is a decision about unattended writes to a real business's
 * books, so the false-negative cases (should have gated, didn't) matter more
 * than the false positives.
 */

const auto = (threshold: number | null = null): ResolvedPolicy => ({ mode: "auto", threshold })
const approve: ResolvedPolicy = { mode: "approve", threshold: null }

describe("shouldGate", () => {
  it("gates everything when the org set the action to approve", () => {
    expect(shouldGate(approve, "low", 1)).toBe(true)
    expect(shouldGate(approve, "low", null)).toBe(true)
    // Even under a threshold that would otherwise allow it.
    expect(shouldGate({ mode: "approve", threshold: 10_000 }, "low", 5)).toBe(true)
  })

  it("lets a low-risk action through on auto with no threshold", () => {
    expect(shouldGate(auto(), "low", 999_999)).toBe(false)
  })

  it("always gates high risk, whatever the policy says", () => {
    // The rule that makes `auto` safe to offer at all: an org can put an
    // action on auto without authorising the dangerous instances of it.
    expect(shouldGate(auto(), "high", null)).toBe(true)
    expect(shouldGate(auto(1_000_000), "high", 1)).toBe(true)
  })

  it("gates once the value exceeds the threshold", () => {
    expect(shouldGate(auto(5000), "low", 5001)).toBe(true)
    expect(shouldGate(auto(5000), "medium", 7500)).toBe(true)
  })

  it("allows a value at or below the threshold", () => {
    expect(shouldGate(auto(5000), "low", 5000)).toBe(false)
    expect(shouldGate(auto(5000), "low", 4999)).toBe(false)
  })

  it("ignores the threshold when the action has no value", () => {
    // An action with no monetary dimension (a lookup, a status change) should
    // not be gated by a threshold it can never be measured against.
    expect(shouldGate(auto(5000), "low", null)).toBe(false)
  })

  it("does not gate medium risk on its own", () => {
    // Medium is the common case; gating it unconditionally would make `auto`
    // meaningless for most of the registry.
    expect(shouldGate(auto(), "medium", 100)).toBe(false)
  })
})

describe("roleAtLeast", () => {
  it("ranks the roles", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true)
    expect(roleAtLeast("admin", "admin")).toBe(true)
    expect(roleAtLeast("operator", "admin")).toBe(false)
    expect(roleAtLeast("viewer", "operator")).toBe(false)
  })

  it("puts agents' operator authority below admin actions", () => {
    // getAgentContext gives agents the operator role. This is what stops an
    // agent from reaching send_invoice or update_organization.
    expect(roleAtLeast("operator", "operator")).toBe(true)
    expect(roleAtLeast("operator", "admin")).toBe(false)
  })
})
