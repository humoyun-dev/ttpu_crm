"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  new: { label: "Yangi", variant: "secondary" },
  submitted: { label: "Yuborilgan", variant: "default" },
  in_progress: { label: "Ko'rib chiqilmoqda", variant: "outline" },
  approved: { label: "Tasdiqlangan", variant: "default" },
  rejected: { label: "Rad etilgan", variant: "destructive" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    variant: "secondary" as const,
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        status === "approved" && "bg-green-600 hover:bg-green-700",
        status === "submitted" && "bg-blue-600 hover:bg-blue-700",
        status === "in_progress" &&
          "bg-yellow-600 hover:bg-yellow-700 text-white",
        className
      )}
    >
      {config.label}
    </Badge>
  );
}

interface GenderBadgeProps {
  gender: string;
  className?: string;
}

const genderConfig: Record<string, { label: string; className: string }> = {
  male: {
    label: "Erkak",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  female: {
    label: "Ayol",
    className: "bg-pink-100 text-pink-800 border-pink-200",
  },
  other: {
    label: "Boshqa",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
  unspecified: {
    label: "Ko'rsatilmagan",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export function GenderBadge({ gender, className }: GenderBadgeProps) {
  const config = genderConfig[gender] || {
    label: gender,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
