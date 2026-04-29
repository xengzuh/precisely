"use client"

import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          An unexpected error occurred. Please try again.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try Again</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
