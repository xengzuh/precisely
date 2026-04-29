"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  Users,
  ClipboardList,
  ScanLine,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getSupabaseClient } from "@/lib/supabase/client"

const navItems = [
  { href: "/dashboard",       label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory",       label: "Inventory", icon: Package },
  { href: "/sales",           label: "Sales",     icon: ShoppingCart },
  { href: "/scanner",         label: "Scanner",   icon: ScanLine },
  { href: "/suppliers",       label: "Suppliers", icon: Users },
  { href: "/purchase-orders", label: "Orders",    icon: ClipboardList },
  { href: "/reports",         label: "Reports",   icon: BarChart3 },
  { href: "/settings",        label: "Settings",  icon: Settings },
]

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
            <LayoutDashboard className="size-5 shrink-0 mx-auto text-sidebar-primary" />
          ) : (
            <span className="font-semibold text-sm truncate text-sidebar-foreground">
              ERP System
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
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

      {/* Mobile bottom nav — visible only below md */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex md:hidden border-t bg-sidebar safe-area-inset-bottom">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          const isScanner = href === "/scanner"
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
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
              <span>{label}</span>
            </Link>
          )
        })}
        <button
          onClick={handleSignOut}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-sidebar-foreground/50 hover:text-destructive transition-colors"
        >
          <LogOut className="size-5" />
          <span>Sign Out</span>
        </button>
      </nav>
    </div>
  )
}
