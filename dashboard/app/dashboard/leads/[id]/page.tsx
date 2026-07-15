"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { leadApi, Lead, LeadStatus, LEAD_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, Check, UserPlus, Users, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { PageLoading } from "@/components/loading";
import { EmptyStateRow } from "@/components/empty-state";
import { useAuth } from "@/lib/auth-context";
import { LeadAddStudentsDialog } from "../lead-add-students-dialog";

const STATUS_BADGE: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
  created: "outline",
  sent: "secondary",
  viewing: "secondary",
  selected: "default",
  closed: "destructive",
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await leadApi.get(id);
      if (res.error) {
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        return;
      }
      setLead(res.data!);
    } catch {
      setError("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const accessUrl = lead?.access_link
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/l/${lead.access_link.token}`
    : "";

  const copyLink = async () => {
    if (!accessUrl) return;
    await navigator.clipboard.writeText(accessUrl);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateSummaries = async () => {
    setGenerating(true);
    const res = await leadApi.generateSummaries(id);
    if (res.error) {
      toast.error("Xatolik yuz berdi");
      setGenerating(false);
      return;
    }
    toast.success("AI tavsiflar yaratilmoqda — bir necha soniyada tayyor bo'ladi");
    setTimeout(async () => { await load(); setGenerating(false); }, 15000);
  };

  if (loading) return <PageLoading />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <ErrorDisplay message={error} onRetry={load} />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/dashboard/leads" className="underline">Leadlar ro&apos;yxatiga qaytish</Link>
        </p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Lead topilmadi.{" "}
        <Link href="/dashboard/leads" className="underline">Orqaga</Link>
      </div>
    );
  }

  const students = lead.lead_students ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Boshqaruv / Leadlar"
        title={lead.title}
        description={lead.employer_name}
        actions={
          <>
            <Badge variant={STATUS_BADGE[lead.status]} className="font-mono text-[11px] uppercase tracking-wider">
              {LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/leads">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Orqaga
              </Link>
            </Button>
          </>
        }
      />

      {lead.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {accessUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ish beruvchi havolasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                {accessUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-accent-gold" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-baseline gap-2 text-base">
            Talabalar
            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              {students.length}
            </span>
          </CardTitle>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleGenerateSummaries} disabled={generating || students.length === 0}>
                {generating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                AI tavsif
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <UserPlus className="mr-2 h-3.5 w-3.5" /> Qo&apos;shish
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Ismi</TableHead>
                <TableHead>AI tavsif</TableHead>
                <TableHead className="text-center">Qiziqish</TableHead>
                <TableHead className="text-center">Yo&apos;naltirildi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <EmptyStateRow colSpan={5} icon={Users} title="Hali talaba qo'shilmagan" />
              ) : (
                students.map(s => (
                  <TableRow key={s.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs tabular-nums">{s.student_external_id}</TableCell>
                    <TableCell className="text-sm">{s.student_name || "—"}</TableCell>
                    <TableCell className="max-w-sm">
                      {s.ai_summary
                        ? <span className="line-clamp-2 text-xs text-muted-foreground" title={s.ai_summary}>{s.ai_summary}</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={s.employer_interested ? "default" : "outline"} className="text-[11px]">
                        {s.employer_interested ? "Ha" : "Yo'q"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={s.forwarded ? "default" : "outline"} className="text-[11px]">
                        {s.forwarded ? "Ha" : "Yo'q"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadAddStudentsDialog lead={lead} open={showAdd} onOpenChange={setShowAdd} onAdded={load} />
    </div>
  );
}
