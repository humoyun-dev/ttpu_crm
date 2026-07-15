"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  aiVerifyApi, AIDecision, DocumentVerification, formatDate,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AI_STATUS_LABELS, DECISION_LABELS, DOC_TYPE_LABELS, formatVal,
} from "@/lib/constants";
import { toast } from "sonner";

/* ── Vertikal yorliqli maydon (sahifalarda umumiy) ── */
export function Field({ label, children, className }: {
  label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="text-sm font-medium leading-snug text-foreground">{children}</div>
    </div>
  );
}

interface VerificationCardProps {
  verification: DocumentVerification;
  /** Admin uchun izoh + tasdiqlash/rad etish/qayta tekshirish tugmalari ko'rsatilsinmi */
  canReview?: boolean;
  /** Review/retry muvaffaqiyatli tugagach yangilangan yozuv bilan chaqiriladi */
  onReviewed?: (v: DocumentVerification) => void;
}

/* ── AI hujjat tekshiruvi kartasi — surveys/[id], students/[id] uchun umumiy ── */
export function VerificationCard({
  verification: v,
  canReview = false,
  onReviewed,
}: VerificationCardProps) {
  const [note, setNote] = useState(v.review_note ?? "");
  const [busy, setBusy] = useState(false);

  const confPct = Math.round((v.confidence_score ?? 0) * 100);
  const confColor =
    v.confidence_level === "green" ? "bg-emerald-500"
    : v.confidence_level === "yellow" ? "bg-amber-500"
    : v.confidence_level === "red" ? "bg-red-500"
    : "bg-muted-foreground/30";
  const decisionColor =
    v.final_decision === "accepted" ? "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-700"
    : v.final_decision === "rejected" ? "bg-red-600 hover:bg-red-600 dark:bg-red-700"
    : "";

  const handleReview = async (decision: AIDecision) => {
    setBusy(true);
    try {
      const res = await aiVerifyApi.review(v.id, { final_decision: decision, review_note: note });
      if (res.error) {
        toast.error(
          Array.isArray(res.error.message) ? res.error.message.join(", ") : res.error.message,
        );
        return;
      }
      if (res.data) {
        toast.success(decision === "accepted" ? "Tasdiqlandi" : "Rad etildi");
        onReviewed?.(res.data);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      const res = await aiVerifyApi.retry(v.id);
      if (res.error) {
        toast.error(
          Array.isArray(res.error.message) ? res.error.message.join(", ") : res.error.message,
        );
        return;
      }
      if (res.data) {
        toast.success("Qayta yuborildi");
        onReviewed?.(res.data);
      }
    } finally {
      setBusy(false);
    }
  };

  const extractedEntries = v.extracted_data
    ? Object.entries(v.extracted_data)
        .map(([k, val]) => [k, formatVal(val)] as [string, string])
        .filter(([, fv]) => fv !== "")
    : [];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <span className="font-medium text-sm">
          {DOC_TYPE_LABELS[v.document_type] || v.document_type}
        </span>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {AI_STATUS_LABELS[v.status] || v.status}
        </Badge>
        <Badge className={cn("ml-auto text-xs text-white", decisionColor || "bg-muted-foreground/60")}>
          {DECISION_LABELS[v.final_decision] || v.final_decision}
        </Badge>
        {v.reviewed_by_name && (
          <span className="font-mono text-[10px] text-muted-foreground">{v.reviewed_by_name}</span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Ishonch darajasi */}
        {v.confidence_score !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Ishonch darajasi
              </p>
              <span className={cn(
                "font-mono text-xs font-bold tabular-nums",
                v.confidence_level === "green" ? "text-emerald-600 dark:text-emerald-400"
                  : v.confidence_level === "yellow" ? "text-amber-600"
                  : "text-red-600",
              )}>
                {confPct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", confColor)}
                style={{ width: `${confPct}%` }}
              />
            </div>
          </div>
        )}

        {/* AI xulosasi */}
        {v.ai_summary && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              AI xulosasi
            </p>
            <blockquote className="border-l-2 border-primary/30 pl-3 text-sm leading-relaxed text-foreground/80 italic">
              {v.ai_summary}
            </blockquote>
          </div>
        )}

        {/* Ogohlantirishlar */}
        {v.flags && v.flags.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Ogohlantirishlar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {v.flags.map((flag) => (
                <Badge
                  key={flag}
                  variant="outline"
                  className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-xs"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {flag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Ajratilgan ma'lumotlar */}
        {extractedEntries.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Ajratilgan ma&apos;lumotlar
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {extractedEntries.map(([key, fv]) => (
                <div key={key} className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-0.5">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs font-medium leading-snug break-words">{fv}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Xatolik xabari */}
        {v.status === "failed" && v.error_message && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {v.error_message}
          </div>
        )}

        {/* Ko'rib chiqish (faqat admin, canReview) */}
        {canReview ? (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Izoh
              </p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Qaror uchun izoh (ixtiyoriy)…"
                className="min-h-[64px] resize-none text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {v.status === "done" && (
                <>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={busy || v.final_decision === "accepted"}
                    onClick={() => handleReview("accepted")}
                  >
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Tasdiqlash
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    disabled={busy || v.final_decision === "rejected"}
                    onClick={() => handleReview("rejected")}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Rad etish
                  </Button>
                </>
              )}
              {v.status === "failed" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={handleRetry}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Qayta tekshirish
                </Button>
              )}
              {v.reviewed_at && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {formatDate(v.reviewed_at, true)}
                </span>
              )}
            </div>
          </div>
        ) : (
          (v.reviewed_at || v.review_note) && (
            <div className="border-t border-border pt-3 flex flex-wrap items-center justify-between gap-2">
              {v.review_note && (
                <p className="text-xs text-muted-foreground italic flex-1">{v.review_note}</p>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {v.reviewed_by_name && (
                  <span className="font-mono text-[10px] text-muted-foreground">{v.reviewed_by_name}</span>
                )}
                {v.reviewed_at && (
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatDate(v.reviewed_at, true)}
                  </span>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
