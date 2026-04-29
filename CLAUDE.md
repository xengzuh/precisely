# CLAUDE.md — ERP System

## Stack (strict — do not deviate)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 App Router |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Components | shadcn/ui only — no other UI libraries |
| Database / Auth | Supabase (PostgreSQL + Auth) — no other DB or auth |
| Icons | Lucide React |

## Hard rules

- **No additional UI libraries.** Only shadcn/ui components. No Radix UI primitives directly (use shadcn wrappers), no MUI, no Chakra, no Ant Design, no Headless UI.
- **Supabase for all DB and auth.** No direct SQL clients, no Prisma, no Drizzle, no NextAuth. Use `@supabase/supabase-js` and `@supabase/ssr`.
- **TypeScript strict mode** is enabled — all files must type-check with zero errors.
- **No `any` types** unless absolutely unavoidable and explicitly commented.

## Routing

All application routes live under `/app/(dashboard)/`. The route group `(dashboard)` applies the shared shell layout (`layout.tsx`) to every page inside it.

```
app/
  (dashboard)/
    layout.tsx      ← sidebar + bottom nav shell
    dashboard/
      page.tsx
    inventory/
      page.tsx
    sales/
      page.tsx
    settings/
      page.tsx
```

## Styling conventions

- **Mobile-first** — base styles target mobile, then `sm:` → `md:` → `lg:` breakpoints.
- `sm:` (≥640 px) — small tablets / large phones
- `md:` (≥768 px) — tablets / desktop sidebar breakpoint
- `lg:` (≥1024 px) — desktop expanded content
- Use Tailwind utility classes only; no inline `style` props unless unavoidable.
- Follow the shadcn/ui CSS variable system (`bg-background`, `text-foreground`, `bg-primary`, etc.) — never hard-code color values.

## Component conventions

- Server Components by default; add `"use client"` only when needed (hooks, browser APIs, event handlers).
- shadcn/ui components live in `components/ui/`. Custom composite components live in `components/`.
- Prefer composition over prop-drilling; extract sub-components when a file exceeds ~150 lines.
