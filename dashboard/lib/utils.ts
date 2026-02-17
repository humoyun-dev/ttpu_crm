import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCourseYearLabel(courseYear?: number | null): string {
  if (!courseYear) return "-";
  if (courseYear === 5) return "Bitirgan";
  return `${courseYear}-kurs`;
}

export function formatUzPhone(phone?: string | null): string {
  const raw = phone?.trim();
  if (!raw) return "-";

  let digits = raw.replace(/\D/g, "");

  // Handle local forms like 0XXYYYZZTT or XXYYYZZTT
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 9 && !digits.startsWith("998")) {
    digits = `998${digits}`;
  }

  // Uzbekistan format: +998 XX XXX XX XX
  if (digits.startsWith("998") && digits.length >= 12) {
    const normalized = digits.slice(0, 12);
    const cc = normalized.slice(0, 3);
    const op = normalized.slice(3, 5);
    const p1 = normalized.slice(5, 8);
    const p2 = normalized.slice(8, 10);
    const p3 = normalized.slice(10, 12);
    return `+${cc} ${op} ${p1} ${p2} ${p3}`;
  }

  return raw;
}
