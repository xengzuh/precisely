import { Skeleton } from "@/components/ui/skeleton"

export default function ScannerLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded" />
        <Skeleton className="h-7 w-28" />
      </div>
      <Skeleton className="w-full aspect-[4/3] rounded-xl" />
      <Skeleton className="h-5 w-52 mx-auto" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  )
}
