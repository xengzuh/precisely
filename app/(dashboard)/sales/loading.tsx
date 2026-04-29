import { Skeleton } from "@/components/ui/skeleton"

export default function SalesLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-16" />
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b p-3">
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4" />
            ))}
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-b last:border-0 p-3">
            <div className="grid grid-cols-5 gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10 ml-auto" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
