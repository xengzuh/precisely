"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignIn() {
    if (!email || !password) {
      setError("Email and password are required")
      return
    }
    setLoading(true)
    setError(null)

    const supabase = getSupabaseClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="flex items-center justify-center pb-2">
        <Image src="/logo.svg" alt="ERP System" width={160} height={48} className="object-contain" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@myerp.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={loading} onClick={handleSignIn} className="w-full">
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
