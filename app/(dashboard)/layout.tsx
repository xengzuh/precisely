"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Package,
  ShoppingCart,
  Settings,
  Users,
  Building2,
  Bot,
  FileText,
  Inbox,
  ClipboardList,
  ScanLine,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LayoutDashboard,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getSupabaseClient } from "@/lib/supabase/client"

/**
 * Grouped because there are now eleven destinations, and a flat list of eleven
 * is a list nobody reads. "Orders" used to mean purchase orders; with sales
 * orders in the product that name is ambiguous, so buying is now "Purchasing".
 */
const navGroups: {
  label: string | null
  items: { href: string; label: string; icon: typeof Package }[]
}[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Agents",
    items: [
      { href: "/inbox",  label: "Inbox",    icon: Inbox },
      { href: "/agents", label: "Approvals", icon: Bot },
    ],
  },
  {
    label: "Sell",
    items: [
      { href: "/customers", label: "Customers", icon: Building2 },
      { href: "/orders",    label: "Orders",    icon: ClipboardList },
      { href: "/invoices",  label: "Invoices",  icon: FileText },
    ],
  },
  {
    label: "Stock",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/sales",     label: "Movements", icon: ShoppingCart },
      { href: "/scanner",   label: "Scanner",   icon: ScanLine },
    ],
  },
  {
    label: "Buy",
    items: [
      { href: "/suppliers",       label: "Suppliers",  icon: Users },
      { href: "/purchase-orders", label: "Purchasing", icon: ClipboardList },
    ],
  },
  {
    label: null,
    items: [
      { href: "/reports",  label: "Reports",  icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

const navItems = navGroups.flatMap((g) => g.items)

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r bg-sidebar transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center border-b px-3 shrink-0">
          {collapsed ? (
            <Image src="/logo.svg" alt="Logo" width={32} height={32} className="mx-auto object-contain" />
          ) : (
            <Image src="/logo.svg" alt="ERP System" width={140} height={36} className="object-contain" />
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navGroups.map((group, i) => (
            <div key={group.label ?? `group-${i}`} className="space-y-0.5 not-first:mt-3">
              {group.label && !collapsed && (
                <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
                  {group.label}
                </p>
              )}
              {group.items.map(({ href, label, icon: Icon }) => {
                // startsWith so a detail page keeps its section highlighted.
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t p-2 shrink-0 space-y-0.5">
          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-destructive transition-colors",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            <LogOut className="size-5 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors",
              collapsed ? "justify-center" : "gap-2"
            )}
          >
            {collapsed ? (
              <ChevronRight className="size-4 shrink-0" />
            ) : (
              <>
                <ChevronLeft className="size-4 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Page content — pushed right by sidebar width */}
      <div
        className={cn(
          "transition-[margin] duration-200 ease-in-out pb-16 md:pb-0",
          collapsed ? "md:ml-16" : "md:ml-60"
        )}
      >
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile bottom nav — visible only below md.
          Eleven destinations will not fit across a phone, so this scrolls
          horizontally rather than dropping items behind a "More" screen that
          would put half the app two taps away. */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex md:hidden overflow-x-auto border-t bg-sidebar safe-area-inset-bottom">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          const isScanner = href === "/scanner"
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isScanner
                  ? active
                    ? "text-primary"
                    : "text-primary/50 hover:text-primary"
                  : active
                  ? "text-sidebar-primary"
                  : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className={isScanner ? "size-6" : "size-5"} />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
        <button
          onClick={handleSignOut}
          className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-sidebar-foreground/50 hover:text-destructive transition-colors"
        >
          <LogOut className="size-5" />
          <span>Sign Out</span>
        </button>
      </nav>
    </div>
  )
}
