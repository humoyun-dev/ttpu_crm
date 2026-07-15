import * as React from "react";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty-state block: muted icon → title → optional description → action.
 * Use in a card body or any block context. For an empty table, wrap it with
 * <EmptyStateRow colSpan={n}>.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="mb-1 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Empty-state rendered inside a <TableBody> — spans all columns so the message
 * sits in the table without collapsing the layout.
 */
export function EmptyStateRow({
  colSpan,
  ...props
}: EmptyStateProps & { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <EmptyState {...props} />
      </TableCell>
    </TableRow>
  );
}
