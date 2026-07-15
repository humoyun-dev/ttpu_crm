"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, User, GraduationCap, FileText, MessageSquare,
  ShieldCheck, Bot, Loader2, Download, ExternalLink, Pencil, RefreshCw, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  bot2Api, aiVerifyApi, downloadFile,
  Bot2Student, StudentRoster, Bot2SurveyResponse, Bot2Document,
  DocumentVerification, formatDate,
} from "@/lib/api";
import { formatUzPhone, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  courseYearLabel, GENDER_LABELS, DOC_TYPE_LABELS,
} from "@/lib/constants";
import { EmploymentBadge, DocStatusBadge, DecisionBadge } from "@/components/status-badge";
import { VerificationCard, Field } from "@/components/verification-card";

export default function StudentDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const isAdmin = user?.role === "admin";
  const rosterId = params.id as string;
  const isNew = rosterId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  const [roster, setRoster] = useState<StudentRoster | null>(null);
  const [student, setStudent] = useState<Bot2Student | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [documents, setDocuments] = useState<Bot2Document[]>([]);
  const [verifications, setVerifications] = useState<DocumentVerification[]>([]);
  const [loadingVerifs, setLoadingVerifs] = useState(false);

  /* ── "new" → create form (edit sahifasi create rejimida) ── */
  useEffect(() => {
    if (isNew) router.replace("/dashboard/students/new/edit");
  }, [isNew, router]);

  // Faqat ko'rsatish uchun yuklaydi — hech qanday avtomatik qaror qabul qilinmaydi.
  // Yakuniy qaror server orkestratsiyasi yoki adminning aniq harakati bilan qo'yiladi.
  const loadVerifications = useCallback(async (studentId: string) => {
    setLoadingVerifs(true);
    try {
      const res = await aiVerifyApi.byStudent(studentId);
      if (res.error || !res.data) return;
      setVerifications(res.data);
    } finally {
      setLoadingVerifs(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Roster + student lookup are independent — fetch concurrently.
      const [rosterRes, studentRes] = await Promise.all([
        bot2Api.getRoster(rosterId),
        bot2Api.listStudents({ roster: rosterId }),
      ]);
      if (rosterRes.error) throw new Error(rosterRes.error.message as string);
      if (!rosterRes.data) throw new Error("Talaba topilmadi");
      const r = rosterRes.data;
      setRoster(r);

      // Bot2Student — roster ID bo'yicha filter
      const st = studentRes.data?.results?.[0] ?? null;
      setStudent(st);

      const studentUUID = st?.id;

      // Surveys + documents parallel
      const [surveysRes, docsRes] = await Promise.all([
        studentUUID
          ? bot2Api.listSurveys({ student: studentUUID, ordering: "-submitted_at", page_size: "50" })
          : Promise.resolve({ data: null }),
        studentUUID
          ? bot2Api.listDocuments({ student: studentUUID, ordering: "-created_at" })
          : Promise.resolve({ data: null }),
      ]);
      setSurveys(surveysRes.data?.results ?? []);
      setDocuments(docsRes.data?.results ?? []);

      if (studentUUID) loadVerifications(studentUUID);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [rosterId, loadVerifications]);

  useEffect(() => { if (!isNew) fetchAll(); }, [fetchAll, isNew]);

  const handleExtractSkills = async () => {
    if (!student) return;
    setExtracting(true);
    const res = await bot2Api.extractSkills(student.id);
    if (res.error) { toast.error("Xatolik yuz berdi"); setExtracting(false); return; }
    toast.success("AI ko'nikma tahlili boshlandi — bir necha soniyada tayyor bo'ladi");
    setTimeout(async () => { await fetchAll(); setExtracting(false); }, 12000);
  };

  if (isNew) return null;
  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={fetchAll} />;
  if (!roster) return <ErrorDisplay message="Talaba topilmadi" />;

  const fullName = student
    ? [student.first_name, student.last_name].filter(Boolean).join(" ").trim()
    : [roster.first_name, roster.last_name].filter(Boolean).join(" ").trim();
  const initials = fullName.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";
  const programName = roster.program_details?.name_uz || roster.program_details?.name;

  const hasVerifiedDoc = verifications.some((v) => v.final_decision === "accepted");
  const hasPendingDoc = verifications.some((v) => v.final_decision === "pending" && v.status === "done");
  const hasRejectedDoc = verifications.some((v) => v.final_decision === "rejected");

  // Type bo'yicha eng oxirgi, faqat tasdiqlangan
  const displayedVerifications = (() => {
    const latestByType = new Map<string, DocumentVerification>();
    for (const v of verifications) {
      const cur = latestByType.get(v.document_type);
      if (!cur || v.created_at > cur.created_at) latestByType.set(v.document_type, v);
    }
    return Array.from(latestByType.values()).filter((v) => v.final_decision === "accepted");
  })();

  /* ── Autentifikatsiyalangan hujjat yuklab olish (token yangilanishi bilan) ── */
  const handleDownload = async (doc: Bot2Document) => {
    const { error: dlError } = await downloadFile(
      bot2Api.documentDownloadUrl(doc.id),
      doc.original_filename || undefined,
    );
    if (dlError) toast.error(dlError);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* ── Header ── */}
      <PageHeader
        eyebrow="Talabalar"
        title={fullName || roster.student_external_id}
        description="Talaba profili, so'rovnomalari va hujjatlari."
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/students/${rosterId}/edit`)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />Tahrirlash
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-1 h-4 w-4" />Orqaga
            </Button>
          </>
        }
      />

      {/* ── Profile hero ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <span className="font-mono text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{fullName || "—"}</span>
            {roster.is_active
              ? <Badge className="bg-success text-success-foreground hover:bg-success/90 text-xs">Aktiv</Badge>
              : <Badge variant="secondary" className="text-xs">Noaktiv</Badge>
            }
            {hasVerifiedDoc && (
              <Badge className="gap-1 bg-info text-info-foreground hover:bg-info/90 text-xs">
                <ShieldCheck className="h-3 w-3" />Tasdiqlangan
              </Badge>
            )}
            {!hasVerifiedDoc && hasPendingDoc && (
              <Badge variant="outline" className="gap-1 text-xs text-warning border-warning/40">
                Ko&apos;rib chiqilmoqda
              </Badge>
            )}
            {!hasVerifiedDoc && !hasPendingDoc && hasRejectedDoc && (
              <Badge variant="destructive" className="gap-1 text-xs">
                Rad etildi
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              # {roster.student_external_id}
            </span>
            {student?.username && (
              <a href={`https://t.me/${student.username}`} target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline">
                @{student.username}
              </a>
            )}
            {programName && (
              <span className="text-xs text-muted-foreground">{programName}</span>
            )}
            {roster.course_year && (
              <span className="font-mono text-xs text-muted-foreground">
                {courseYearLabel(roster.course_year)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 1: Personal | Academic ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Shaxsiy ma'lumot */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <User className="h-3.5 w-3.5" />Shaxsiy ma&apos;lumot
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Jins">
                {GENDER_LABELS[student?.gender || "unspecified"] || "—"}
              </Field>
              <Field label="Tug'ilgan sana">
                {roster.birth_date ? formatDate(roster.birth_date) : "—"}
              </Field>
              <Field label="Telefon" className="col-span-2">
                {student?.phone ? (
                  <a href={`tel:${student.phone}`} className="font-mono text-primary hover:underline">
                    {formatUzPhone(student.phone)}
                  </a>
                ) : "—"}
              </Field>
              {student?.username && (
                <Field label="Telegram" className="col-span-2">
                  <a href={`https://t.me/${student.username}`} target="_blank" rel="noreferrer"
                    className="text-primary hover:underline">
                    @{student.username}
                  </a>
                </Field>
              )}
              {student?.telegram_user_id && (
                <Field label="Telegram ID">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">
                    {student.telegram_user_id}
                  </code>
                </Field>
              )}
              <Field label="Hujjat holati">
                {hasVerifiedDoc ? (
                  <span className="font-medium text-success">✓ Tasdiqlangan</span>
                ) : hasPendingDoc ? (
                  <span className="font-medium text-warning">Ko&apos;rib chiqilmoqda</span>
                ) : hasRejectedDoc ? (
                  <span className="font-medium text-destructive">✗ Rad etildi</span>
                ) : (
                  <span className="text-muted-foreground">Hujjat yo&apos;q</span>
                )}
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Ta'lim ma'lumoti */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />Ta&apos;lim ma&apos;lumoti
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {programName && (
                <Field label="Yo'nalish" className="col-span-2">{programName}</Field>
              )}
              <Field label="Kurs">
                <span className="font-mono">{courseYearLabel(roster.course_year)}</span>
              </Field>
              <Field label="Holat">
                <Badge variant={roster.is_active ? "default" : "secondary"} className={cn("text-xs", roster.is_active && "bg-success text-success-foreground hover:bg-success/90")}>
                  {roster.is_active ? "Aktiv" : "Noaktiv"}
                </Badge>
              </Field>
              <Field label="Kampaniya" className="col-span-2">
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {roster.roster_campaign}
                </code>
              </Field>
              <Field label="Qo'shilgan">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDate(roster.created_at)}
                </span>
              </Field>
              {student && (
                <Field label="Bot faolligi">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatDate(student.created_at)}
                  </span>
                </Field>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── AI ko'nikma profili ── */}
      {student && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent-gold" />AI ko&apos;nikma profili
              </CardTitle>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={handleExtractSkills} disabled={extracting}>
                  {extracting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  {student.ai_skills_at ? "Qayta tahlil" : "AI tahlil"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {student.ai_skills_at && student.ai_skills ? (
              <div className="space-y-3">
                {!!student.ai_skills.skills?.length && (
                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Ko&apos;nikmalar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {student.ai_skills.skills.map((sk, i) => <Badge key={i} variant="secondary" className="text-xs">{sk}</Badge>)}
                    </div>
                  </div>
                )}
                {!!student.ai_skills.languages?.length && (
                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tillar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {student.ai_skills.languages.map((l, i) => <Badge key={i} variant="outline" className="text-xs">{l}</Badge>)}
                    </div>
                  </div>
                )}
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {student.ai_skills.level && <Field label="Daraja"><span className="capitalize">{student.ai_skills.level}</span></Field>}
                  {student.ai_skills.education && <Field label="Ta'lim">{student.ai_skills.education}</Field>}
                  {student.ai_skills.experience_summary && (
                    <Field label="Tajriba" className="sm:col-span-2">{student.ai_skills.experience_summary}</Field>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Hali AI tahlil qilinmagan. Talabaning CV&apos;si bo&apos;lsa &quot;AI tahlil&quot; tugmasini bosing.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── So'rovnomalar ── */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />So&apos;rovnomalar
              {surveys.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tabular-nums">
                  {surveys.length}
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground px-5">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <span>So&apos;rovnoma topilmadi</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Sana</TableHead>
                  <TableHead>Kampaniya</TableHead>
                  <TableHead>Ish holati</TableHead>
                  <TableHead>Hujjat</TableHead>
                  <TableHead className="pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((s) => {
                  const docStatus = s.doc_verification_status;
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/surveys/${s.id}`)}
                    >
                      <TableCell className="pl-5">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDate(s.submitted_at || s.created_at, true)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {s.survey_campaign || "—"}
                        </code>
                      </TableCell>
                      <TableCell>
                        <EmploymentBadge status={s.employment_status} />
                      </TableCell>
                      <TableCell>
                        <DocStatusBadge status={docStatus ?? "no_docs"} />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Hujjatlar (Bot2Documents) ── */}
      {documents.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />Yuklangan hujjatlar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Hujjat turi</TableHead>
                  <TableHead>Fayl</TableHead>
                  <TableHead>Yuklangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const label = DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type;
                  const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null;
                  // Mos verifikatsiyani doc_type bo'yicha topamiz (eng oxirgisi)
                  const matchedVerif = verifications
                    .filter((v) => v.document_type === doc.doc_type)
                    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];
                  const decision = matchedVerif?.final_decision;
                  return (
                    <TableRow key={doc.id} className="group">
                      <TableCell className="pl-5 font-medium text-sm">{label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                        <span className="truncate block">
                          {doc.original_filename || "hujjat"}
                          {sizeKb ? <span className="text-muted-foreground/60"> · {sizeKb} KB</span> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(doc.created_at)}
                      </TableCell>
                      <TableCell>
                        {decision ? (
                          <DecisionBadge decision={decision} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        <button type="button" onClick={() => handleDownload(doc)}
                          aria-label="Yuklab olish" title="Yuklab olish"
                          className="flex items-center justify-center h-7 w-7 rounded hover:bg-muted transition-colors ml-auto">
                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── AI Hujjat tekshiruvi ── */}
      {student && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />AI Hujjat tekshiruvi
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={loadingVerifs}
                aria-label="Yangilash" title="Yangilash"
                onClick={() => loadVerifications(student.id)}>
                <RefreshCw className={cn("h-3.5 w-3.5", loadingVerifs && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {loadingVerifs ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Yuklanmoqda…
              </div>
            ) : displayedVerifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <FileText className="h-8 w-8 opacity-30" />
                <span>Tasdiqlangan hujjat topilmadi</span>
              </div>
            ) : (
              <div className="space-y-5">
                {displayedVerifications.map((v) => (
                  <VerificationCard key={v.id} verification={v} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
