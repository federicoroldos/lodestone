import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function RowSkeleton({ className }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5', className)}>
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-3 w-16 shrink-0" />
      <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
    </div>
  );
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

function KpiTileSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card/82 backdrop-blur-sm p-4 border-l-2 border-l-border">
      <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
      <div className="min-w-0 space-y-2 flex-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="p-5">
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}

function PlayerCardSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <Skeleton className="h-[22px] w-[22px] shrink-0 rounded" />
      <Skeleton className="h-4 flex-1" />
      <div className="flex gap-1">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
      </div>
    </div>
  );
}

function PlayerGridSkeleton({ cards = 3 }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <PlayerCardSkeleton key={i} />
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 4, cols = 6 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} className={cn('py-2', i === 0 ? 'pl-4 text-left' : i === cols - 1 ? 'pr-4 text-right' : 'text-left')}>
                <Skeleton className="h-3 w-12" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="border-b border-border/50 last:border-0">
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} className={cn('py-3', c === 0 ? 'pl-4' : c === cols - 1 ? 'pr-4' : 'pr-4')}>
                  <Skeleton className={cn('h-4', c === 0 ? 'w-32' : c === cols - 1 ? 'w-20 ml-auto' : 'w-16')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConsoleLineSkeleton() {
  return (
    <div className="grid grid-cols-[6px_80px_1fr] gap-x-5 items-start px-5 py-0.5">
      <Skeleton className="h-full w-[3px] self-stretch rounded-full" />
      <Skeleton className="h-3.5 w-14" />
      <Skeleton className="h-3.5 w-full" />
    </div>
  );
}

function ConsoleSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-1.5 px-5 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <ConsoleLineSkeleton key={i} />
      ))}
    </div>
  );
}

function InfoRowSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-2.5 border-b border-border last:border-0">
      <Skeleton className="h-3.5 w-16 shrink-0" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

function ModrinthResultSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
      <Skeleton className="h-12 w-12 rounded shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
    </div>
  );
}

function FileEntrySkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
      <Skeleton className="h-4 w-4 shrink-0" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-3 w-24 shrink-0" />
      <div className="flex items-center gap-1">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </div>
  );
}

export {
  RowSkeleton,
  ListSkeleton,
  KpiTileSkeleton,
  ChartCardSkeleton,
  PlayerCardSkeleton,
  PlayerGridSkeleton,
  TableSkeleton,
  ConsoleLineSkeleton,
  ConsoleSkeleton,
  InfoRowSkeleton,
  ModrinthResultSkeleton,
  FileEntrySkeleton,
};
