"use client";

import { Loader2 } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton";

export function PageLoading() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Table loading placeholder — renders skeleton rows that match the Table
 * primitive's density. Use in a card/block context (it renders <div>s, not
 * table rows); for in-<TableBody> loading use <TableRowsSkeleton/>.
 */
export function TableLoading({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return <TableSkeleton rows={rows} cols={cols} />;
}
