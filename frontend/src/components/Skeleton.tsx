/** Skeleton loading primitives. */
import clsx from 'clsx'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={clsx('animate-pulse bg-gray-200 rounded', className)} />
  )
}

/** A row in a table skeleton */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

/** Card-shaped skeleton */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={clsx('bg-white rounded-xl border p-6 space-y-3', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  )
}

/** Thesis / list item skeleton */
export function SkeletonItem() {
  return (
    <div className="bg-white rounded-xl border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-8 ml-auto" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}
