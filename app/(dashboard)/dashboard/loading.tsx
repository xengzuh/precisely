import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Daily Sales */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="rounded-xl border overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b last:border-0 p-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-10 ml-auto" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Revenue chart */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    </div>
  )
}
