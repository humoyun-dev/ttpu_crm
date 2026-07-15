"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions = [20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      {/* Info + page size */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono text-xs tabular-nums">
          {from}–{to} / {totalCount}
        </span>
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs">qator</span>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="Birinchi sahifa"
          title="Birinchi sahifa"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Oldingi sahifa"
          title="Oldingi sahifa"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <span className="min-w-[4rem] text-center font-mono text-sm tabular-nums">
          {page} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Keyingi sahifa"
          title="Keyingi sahifa"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          aria-label="Oxirgi sahifa"
          title="Oxirgi sahifa"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
