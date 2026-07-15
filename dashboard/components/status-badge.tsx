"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Mars, Venus, Circle, ShieldCheck } from "lucide-react";
import type { DocVerificationStatus } from "@/lib/api";
import { EMPLOYMENT_STATUS_LABELS, DECISION_LABELS } from "@/lib/constants";

/**
 * Theme-safe status + gender badges. Every color derives from a design token
 * (primary / success / warning / destructive / muted) so it adapts to light and
 * dark mode and stays inside the "akademik & aniq" palette — no hardcoded
 * Tailwind color shades that break on the dark page background.
 */

type Variant = "default" | "secondary" | "destructive" | "outline";

const statusConfig: Record<string, { label: string; variant: Variant; className?: string }> = {
  new: { label: "Yangi", variant: "secondary" },
  submitted: { label: "Yuborilgan", variant: "default" },
  in_progress: {
    label: "Ko'rib chiqilmoqda",
    variant: "outline",
    className: "border-transparent bg-warning text-warning-foreground",
  },
  approved: {
    label: "Tasdiqlangan",
    variant: "outline",
    className: "border-transparent bg-success text-success-foreground",
  },
  accepted: {
    label: "Tasdiqlangan",
    variant: "outline",
    className: "border-transparent bg-success text-success-foreground",
  },
  rejected: { label: "Rad etilgan", variant: "destructive" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] || { label: status, variant: "secondary" as Variant };
  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}

const genderConfig: Record<
  string,
  { label: string; icon: typeof Mars | null; className: string }
> = {
  male: {
    label: "Erkak",
    icon: Mars,
    className: "border-transparent bg-primary/10 text-primary",
  },
  female: {
    label: "Ayol",
    icon: Venus,
    className: "border-transparent bg-primary/10 text-primary",
  },
  other: {
    label: "Boshqa",
    icon: Circle,
    className: "border-transparent bg-muted text-muted-foreground",
  },
  unspecified: {
    label: "Ko'rsatilmagan",
    icon: null,
    className: "border-transparent bg-muted text-muted-foreground",
  },
};

export function GenderBadge({ gender, className }: { gender: string; className?: string }) {
  const config = genderConfig[gender] || genderConfig.unspecified;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {Icon && <Icon className="size-3" />}
      {config.label}
    </Badge>
  );
}

/**
 * Employment status ("Ishlaysizmi?") — employed reads as a positive/success
 * state, everyone else stays neutral. Single source of truth for the badge that
 * was previously re-styled inline (emerald here, navy there) across pages.
 */
export function EmploymentBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const employed = status === "employed";
  return (
    <Badge
      variant={employed ? "outline" : "secondary"}
      className={cn(
        "whitespace-nowrap text-xs",
        employed && "border-transparent bg-success text-success-foreground",
        className,
      )}
    >
      {EMPLOYMENT_STATUS_LABELS[status] || status}
    </Badge>
  );
}

/**
 * Aggregate document-verification status shown on a survey row
 * (verified / pending / rejected / no_docs). Token-based, dark-safe — replaces
 * four inline copies that hardcoded emerald/amber/red shades.
 */
export function DocStatusBadge({
  status,
  className,
}: {
  status: DocVerificationStatus;
  className?: string;
}) {
  if (status === "verified") {
    return (
      <Badge className={cn("gap-1 border-transparent bg-success text-success-foreground text-xs", className)}>
        <ShieldCheck className="size-3" />
        Tasdiqlangan
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className={cn("border-transparent bg-warning text-warning-foreground text-xs", className)}>
        Ko&apos;rib chiqilmoqda
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="destructive" className={cn("text-xs", className)}>
        Rad etildi
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-xs text-muted-foreground", className)}>
      Hujjat yo&apos;q
    </Badge>
  );
}

/**
 * Per-document AI final decision (pending / accepted / rejected).
 */
export function DecisionBadge({
  decision,
  className,
}: {
  decision?: string | null;
  className?: string;
}) {
  if (decision === "accepted") {
    return (
      <Badge className={cn("border-transparent bg-success text-success-foreground text-xs", className)}>
        {DECISION_LABELS.accepted}
      </Badge>
    );
  }
  if (decision === "rejected") {
    return (
      <Badge variant="destructive" className={cn("text-xs", className)}>
        {DECISION_LABELS.rejected}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-xs text-muted-foreground", className)}>
      {DECISION_LABELS.pending}
    </Badge>
  );
}
