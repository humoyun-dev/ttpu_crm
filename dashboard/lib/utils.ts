import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* Yagona manba lib/constants.ts'dagi courseYearLabel — eski import yo'li saqlanadi. */
export { courseYearLabel as formatCourseYearLabel } from "./constants";

/* Mahalliy (local) YYYY-MM-DD. toISOString() UTC'ga o'girib yuboradi —
   Toshkentda (UTC+5) mahalliy yarim tun oldingi kunga tushib qoladi. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* YYYY-MM-DD satriga (mahalliy taqvimda) kun qo'shadi. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toLocalDateString(new Date(y, m - 1, d + days));
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
