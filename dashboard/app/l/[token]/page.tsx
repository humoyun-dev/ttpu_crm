"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchAccessLink, submitAccessLinkInterest, AccessLinkPublic, DOCUMENT_TYPE_LABELS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Building2, Loader2, AlertCircle } from "lucide-react";

export default function AccessLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AccessLinkPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchAccessLink(token)
      .then(res => {
        if (res.error) setError("Havola topilmadi yoki muddati o'tgan.");
        else setData(res.data!);
      })
      .catch(() => setError("Havola topilmadi yoki muddati o'tgan."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleInterest = async () => {
    setSubmitting(true);
    try {
      const res = await submitAccessLinkInterest(token);
      if (res.error) throw new Error();
      setSubmitted(true);
    } catch {
      setError("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-center text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-lg space-y-5">
        <div className="flex items-center justify-center gap-2.5 py-4">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            TTPU Bandlik Markazi
          </span>
        </div>

        <Card>
          <CardHeader>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Ish o&apos;rni taklifi
            </p>
            <CardTitle className="mt-1.5">{data?.lead_title}</CardTitle>
            <CardDescription>{data?.employer_name}</CardDescription>
            <div className="relative mt-3 h-px w-full bg-border">
              <span className="absolute left-0 top-0 h-px w-12 bg-accent-gold" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {data?.students && data.students.length > 0 && (
              <div>
                <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Nomzodlar · <span className="tabular-nums">{data.students.length}</span> ta
                </p>
                <div className="space-y-2">
                  {data.students.map((s, i) => (
                    <div key={i} className="rounded-md border border-border bg-card px-3 py-3 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            {s.first_name} {s.last_name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{s.student_external_id}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.documents.map((doc, j) => (
                            <Badge key={j} variant={doc.status === "verified" ? "default" : "outline"} className="text-xs">
                              {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {submitted ? (
              <div className="flex flex-col items-center gap-3 rounded-md border border-emerald-600/20 bg-emerald-50 p-6 dark:bg-emerald-950/20">
                <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-500" />
                <p className="text-center font-medium text-emerald-700 dark:text-emerald-400">
                  Javobingiz qabul qilindi!
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  TTPU bandlik markazi mutaxassislari siz bilan bog'lanadi.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Button onClick={handleInterest} disabled={submitting} className="w-full" size="lg">
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Yuborilmoqda...</>
                  ) : (
                    "Qiziqaman — bog'laning"
                  )}
                </Button>
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <p className="text-center text-xs text-muted-foreground">
                  Ushbu havola faqat siz uchun yuborilgan. Shaxsiy ma'lumotlaringiz himoyalangan.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground pb-4">
          © TTPU Bandlik Markazi
        </p>
      </div>
    </div>
  );
}
