"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, User, GraduationCap, FileText,
  MessageSquare, Pencil, Save, X,
  Languages, Download, File,
  CheckCircle2, XCircle, RefreshCw, Bot, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PageHeader } from "@/components/page-header";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  bot2Api, catalogApi, aiVerifyApi, downloadFile,
  Bot2SurveyResponse, Bot2Student, Bot2Document, CatalogItem, DocumentVerification, formatDate,
} from "@/lib/api";
import { formatUzPhone, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  CONSENT_LABELS, LABEL_TRANSLATIONS, courseYearLabel,
  EMPLOYMENT_STATUS_LABELS, GENDER_LABELS,
} from "@/lib/constants";
import { EmploymentBadge, DocStatusBadge } from "@/components/status-badge";
import { VerificationCard, Field } from "@/components/verification-card";

/* ── Edit field ── */
function EditField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label} className="h-9" />
    </div>
  );
}

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const id = params.id as string;

  const [survey, setSurvey] = useState<Bot2SurveyResponse | null>(null);
  const [student, setStudent] = useState<Bot2Student | null>(null);
  const [documents, setDocuments] = useState<Bot2Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isAdmin && searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);
  const [regions, setRegions] = useState<CatalogItem[]>([]);

  const [editStudent, setEditStudent] = useState({ first_name: "", last_name: "", phone: "", gender: "unspecified" as string, username: "", region: "" as string });
  const [editSurvey, setEditSurvey] = useState({ employment_status: "", employment_company: "", employment_role: "", suggestions: "", survey_campaign: "", course_year: 1 as number });
  const [editConsents, setEditConsents] = useState<Record<string, boolean>>({ want_help: false, share_with_employers: false });
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});

  const [verifications, setVerifications] = useState<DocumentVerification[]>([]);
  const [loadingVerifs, setLoadingVerifs] = useState(false);

  const loadVerifications = useCallback(async (studentId: string, surveyId: string) => {
    setLoadingVerifs(true);
    try {
      const res = await aiVerifyApi.byStudent(studentId, surveyId);
      if (res.error) return;
      const list = res.data || [];
      setVerifications(list);
    } finally {
      setLoadingVerifs(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Survey + documents are independent — fetch concurrently.
      const [surveyRes, docsRes] = await Promise.all([
        bot2Api.getSurvey(id),
        bot2Api.listDocuments({ survey: id }),
      ]);
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);
      if (!surveyRes.data) throw new Error("So'rovnoma topilmadi");
      setSurvey(surveyRes.data);
      populateSurveyForm(surveyRes.data);
      if (surveyRes.data.student_details) {
        setStudent(surveyRes.data.student_details);
        populateStudentForm(surveyRes.data.student_details);
        loadVerifications(surveyRes.data.student_details.id, id);
      } else if (surveyRes.data.student) {
        const studentRes = await bot2Api.getStudent(surveyRes.data.student);
        if (studentRes.data) {
          setStudent(studentRes.data);
          populateStudentForm(studentRes.data);
          loadVerifications(studentRes.data.id, id);
        }
      }
      if (docsRes.data?.results) {
        const seen = new Set<string>();
        setDocuments(docsRes.data.results.filter((d) => {
          if (seen.has(d.doc_type)) return false;
          seen.add(d.doc_type);
          return true;
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [id, loadVerifications]);

  function populateSurveyForm(s: Bot2SurveyResponse) {
    setEditSurvey({ employment_status: s.employment_status || "", employment_company: s.employment_company || "", employment_role: s.employment_role || "", suggestions: s.suggestions || "", survey_campaign: s.survey_campaign || "", course_year: s.course_year || 1 });
    const c = (s.consents as Record<string, boolean>) || {};
    setEditConsents({ want_help: c.want_help ?? false, share_with_employers: c.share_with_employers ?? false, ...c });
    const a = (s.answers as Record<string, string>) || {};
    setEditAnswers(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v ?? "")])));
  }

  function populateStudentForm(st: Bot2Student) {
    setEditStudent({ first_name: st.first_name || "", last_name: st.last_name || "", phone: st.phone || "", gender: st.gender || "unspecified", username: st.username || "", region: st.region || "" });
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  // Regions are only used by the edit form — fetch lazily when edit mode is
  // entered (avoids a request on every read-only view).
  useEffect(() => {
    if (!editing || regions.length > 0) return;
    catalogApi.list("region").then((res) => {
      if (res.data?.results) setRegions(res.data.results);
    });
  }, [editing, regions.length]);

  const handleSave = async () => {
    if (!survey) return;
    setSaving(true);
    try {
      if (student) {
        const sp: Partial<Bot2Student> = { first_name: editStudent.first_name, last_name: editStudent.last_name, phone: editStudent.phone, gender: editStudent.gender as Bot2Student["gender"], username: editStudent.username };
        if (editStudent.region) sp.region = editStudent.region;
        const sr = await bot2Api.updateStudent(student.id, sp);
        if (sr.error) throw new Error(sr.error.message as string);
        if (sr.data) setStudent(sr.data);
      }
      const surveyRes = await bot2Api.updateSurvey(survey.id, { employment_status: editSurvey.employment_status, employment_company: editSurvey.employment_company, employment_role: editSurvey.employment_role, suggestions: editSurvey.suggestions, survey_campaign: editSurvey.survey_campaign, course_year: editSurvey.course_year, consents: editConsents, answers: editAnswers });
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);
      if (surveyRes.data) { setSurvey(surveyRes.data); populateSurveyForm(surveyRes.data); }
      toast.success("Saqlandi");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setSaving(false);
    }
  };

  /* ── Autentifikatsiyalangan hujjat yuklab olish (token yangilanishi bilan) ── */
  const handleDownload = async (doc: Bot2Document) => {
    const { error: dlError } = await downloadFile(
      bot2Api.documentDownloadUrl(doc.id),
      doc.original_filename || undefined,
    );
    if (dlError) toast.error(dlError);
  };

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={fetchData} />;
  if (!survey) return <ErrorDisplay message="So'rovnoma topilmadi" />;

  const answers = (survey.answers as Record<string, string | number>) || {};
  const consents = (survey.consents as Record<string, boolean>) || {};
  const programName = survey.program_details?.name_uz || survey.program_details?.name || null;
  const regionName = student?.region_details?.name_uz || student?.region_details?.name || null;
  const englishLevel = answers.english_level as string;
  const russianLevel = answers.russian_level as string;
  const otherAnswers = Object.entries(answers).filter(
    ([k]) => !["english_level", "russian_level", "region_label", "program_label", "course_year", "cv_doc_id", "cert_doc_id", "known_langs"].includes(k),
  );
  const isEmployed = survey.employment_status === "employed";
  const studentFullName = student ? [student.first_name, student.last_name].filter(Boolean).join(" ").trim() : "";
  const initials = studentFullName.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";

  const RATING_KEYS = new Set(["dormitory","transport","food","library","sports","wifi","cleanliness","security","teachers","materials","schedule","facilities"]);
  const isRating = (key: string, value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    return !isNaN(num) && num >= 1 && num <= 5 && (key.includes("rating") || key.includes("satisfaction") || RATING_KEYS.has(key));
  };
  const renderRating = (value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(num)) return <span>{String(value)}</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map(s => <span key={s} className={num >= s ? "text-accent-gold" : "text-muted-foreground/30"}>★</span>)}
        <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">({num}/5)</span>
      </div>
    );
  };

  const docStatus = survey.doc_verification_status;

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* ── Header ── */}
      <PageHeader
        eyebrow="Talabalar / So'rovnomalar"
        title={studentFullName || "So'rovnoma"}
        description="Talaba so'rovnomasi javoblari va profili."
        actions={
          <>
            {isAdmin && (
              editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => { if (survey) populateSurveyForm(survey); if (student) populateStudentForm(student); setEditing(false); }} disabled={saving}>
                    <X className="mr-1 h-3.5 w-3.5" />Bekor
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="mr-1 h-3.5 w-3.5" />{saving ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />Tahrirlash
                </Button>
              )
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
            <span className="text-lg font-semibold tracking-tight">{studentFullName || "—"}</span>
            <EmploymentBadge status={survey.employment_status} />
            {docStatus !== "no_docs" && <DocStatusBadge status={docStatus} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {student?.student_external_id && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                # {student.student_external_id}
              </span>
            )}
            {student?.username && (
              <a href={`https://t.me/${student.username}`} target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline">
                @{student.username}
              </a>
            )}
            {survey.submitted_at && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatDate(survey.submitted_at, true)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 1: Contact | Education + Employment ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Shaxsiy ma'lumot */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <User className="h-3.5 w-3.5" />Shaxsiy ma&apos;lumot
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Ism" value={editStudent.first_name} onChange={(v) => setEditStudent(p => ({ ...p, first_name: v }))} />
                  <EditField label="Familiya" value={editStudent.last_name} onChange={(v) => setEditStudent(p => ({ ...p, last_name: v }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Jins</Label>
                  <Select value={editStudent.gender} onValueChange={(v) => setEditStudent(p => ({ ...p, gender: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Erkak</SelectItem>
                      <SelectItem value="female">Ayol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EditField label="Telefon" value={editStudent.phone} onChange={(v) => setEditStudent(p => ({ ...p, phone: v }))} type="tel" />
                <EditField label="Telegram username" value={editStudent.username} onChange={(v) => setEditStudent(p => ({ ...p, username: v }))} />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Viloyat</Label>
                  <Select value={editStudent.region || ""} onValueChange={(v) => setEditStudent(p => ({ ...p, region: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                    <SelectContent>{regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name_uz || r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Jins">
                  {GENDER_LABELS[student?.gender || "unspecified"] || "—"}
                </Field>
                <Field label="Viloyat">{regionName || "—"}</Field>
                <Field label="Telefon" className="col-span-2">
                  {student?.phone ? (
                    <a href={`tel:${student.phone}`}
                      className="font-mono text-primary hover:underline">
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
                <Field label="Student ID" className="col-span-2">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">
                    {student?.student_external_id || "—"}
                  </code>
                </Field>
                {student?.telegram_user_id && (
                  <Field label="Telegram ID">
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">
                      {student.telegram_user_id}
                    </code>
                  </Field>
                )}
                <Field label="Hujjat holati">
                  {docStatus === "verified" ? (
                    <span className="font-medium text-success">✓ Tasdiqlangan</span>
                  ) : docStatus === "pending" ? (
                    <span className="font-medium text-warning">Ko&apos;rib chiqilmoqda</span>
                  ) : docStatus === "rejected" ? (
                    <span className="font-medium text-destructive">✗ Rad etildi</span>
                  ) : (
                    <span className="text-muted-foreground">Hujjat yo&apos;q</span>
                  )}
                </Field>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ta'lim va ish */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />Ta&apos;lim va ish
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {editing ? (
              <div className="space-y-3">
                {programName && <p className="rounded-md bg-muted px-3 py-2 text-sm">{programName}</p>}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Kurs</Label>
                  <Select value={String(editSurvey.course_year)} onValueChange={(v) => setEditSurvey(p => ({ ...p, course_year: parseInt(v) }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4].map(y => <SelectItem key={y} value={String(y)}>{y}-kurs</SelectItem>)}
                      <SelectItem value="5">Bitirgan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ishlaysizmi?</Label>
                  <Select value={editSurvey.employment_status} onValueChange={(v) => setEditSurvey(p => ({ ...p, employment_status: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employed">Ha, ishlayman</SelectItem>
                      <SelectItem value="unemployed">Yo&apos;q, ishlamayman</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EditField label="Kompaniya" value={editSurvey.employment_company} onChange={(v) => setEditSurvey(p => ({ ...p, employment_company: v }))} />
                <EditField label="Lavozim" value={editSurvey.employment_role} onChange={(v) => setEditSurvey(p => ({ ...p, employment_role: v }))} />
              </div>
            ) : (
              <>
                {/* Employment status block */}
                <div className={cn(
                  "rounded-lg border px-4 py-3",
                  isEmployed
                    ? "border-success/30 bg-success/10"
                    : "border-border bg-muted/40",
                )}>
                  <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Ish holati
                  </p>
                  <p className={cn(
                    "text-base font-semibold",
                    isEmployed ? "text-success" : "text-foreground",
                  )}>
                    {EMPLOYMENT_STATUS_LABELS[survey.employment_status] || survey.employment_status || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {programName && (
                    <Field label="Yo'nalish" className="col-span-2">{programName}</Field>
                  )}
                  <Field label="Kurs">
                    <span className="font-mono">{courseYearLabel(survey.course_year)}</span>
                  </Field>
                  {isEmployed && survey.employment_company && (
                    <Field label="Kompaniya" className="col-span-2">{survey.employment_company}</Field>
                  )}
                  {isEmployed && survey.employment_role && (
                    <Field label="Lavozim" className="col-span-2">{survey.employment_role}</Field>
                  )}
                </div>

                {/* Timestamps */}
                <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">
                  <Field label="Yaratilgan">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(survey.created_at)}
                    </span>
                  </Field>
                  {survey.submitted_at && (
                    <Field label="Yuborilgan">
                      <span className="font-mono text-xs tabular-nums">
                        {formatDate(survey.submitted_at, true)}
                      </span>
                    </Field>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Consents | Languages ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Roziliklar */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />Roziliklar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {editing ? (
              <div className="space-y-2">
                {Object.entries(editConsents).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <span className="text-sm">{CONSENT_LABELS[key] || key.replace(/_/g, " ")}</span>
                    <Button variant={value ? "default" : "outline"} size="sm" className={cn("h-7 min-w-14 text-xs", value && "bg-success text-success-foreground hover:bg-success/90")}
                      onClick={() => setEditConsents(p => ({ ...p, [key]: !value }))}>
                      {value ? "Ha" : "Yo'q"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {[
                  { key: "want_help", label: "Ish topishda yordam kerak" },
                  { key: "share_with_employers", label: "Ma'lumotlarni ish beruvchilarga ulashish" },
                ].map(({ key, label }) => {
                  const value = consents[key] ?? false;
                  return (
                    <div key={key} className="flex items-center gap-3 py-3">
                      <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        value
                          ? "bg-success/15"
                          : "bg-muted",
                      )}>
                        {value
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </div>
                      <span className="flex-1 text-sm">{label}</span>
                      <span className={cn(
                        "font-mono text-xs font-semibold tabular-nums",
                        value ? "text-success" : "text-muted-foreground",
                      )}>
                        {value ? "Ha" : "Yo'q"}
                      </span>
                    </div>
                  );
                })}
                {/* Any extra consent keys beyond the known two */}
                {Object.entries(consents)
                  .filter(([k]) => !["want_help", "share_with_employers"].includes(k))
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3 py-3">
                      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", value ? "bg-success/15" : "bg-muted")}>
                        {value ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <span className="flex-1 text-sm">{CONSENT_LABELS[key] || key.replace(/_/g, " ")}</span>
                      <span className={cn("font-mono text-xs font-semibold", value ? "text-success" : "text-muted-foreground")}>{value ? "Ha" : "Yo'q"}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Til darajalari */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Languages className="h-3.5 w-3.5" />Til darajalari
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {englishLevel || russianLevel ? (
              <div className="divide-y divide-border">
                {englishLevel && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm">🇬🇧 Ingliz tili</span>
                    <Badge variant="outline" className="font-mono text-sm font-bold tabular-nums px-3">
                      {englishLevel}
                    </Badge>
                  </div>
                )}
                {russianLevel && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm">🇷🇺 Rus tili</span>
                    <Badge variant="outline" className="font-mono text-sm font-bold tabular-nums px-3">
                      {russianLevel}
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Til darajasi kiritilmagan
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Takliflar ── */}
      {(editing || survey.suggestions) && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />Takliflar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {editing ? (
              <Textarea value={editSurvey.suggestions}
                onChange={(e) => setEditSurvey(p => ({ ...p, suggestions: e.target.value }))}
                placeholder="Universitet faoliyatini takomillashtirish bo'yicha takliflar…"
                className="min-h-[100px]" />
            ) : (
              <blockquote className="border-l-2 border-primary/30 pl-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap italic">
                {survey.suggestions}
              </blockquote>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Hujjatlar ── */}
      {documents.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <File className="h-3.5 w-3.5" />Hujjatlar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {documents.map((doc) => {
                const label = doc.doc_type === "cv" ? "CV / Rezyume"
                  : doc.doc_type === "employment" ? "Ish joyi hujjati"
                  : "Til sertifikati";
                const emoji = doc.doc_type === "cv" ? "📄" : doc.doc_type === "employment" ? "🏢" : "📜";
                const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null;
                return (
                  <button key={doc.id} type="button" onClick={() => handleDownload(doc)}
                    className="group flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40">
                    <FileText className="h-8 w-8 shrink-0 text-primary/60" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{emoji} {label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.original_filename || "hujjat"}{sizeKb ? ` · ${sizeKb} KB` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</p>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── So'rovnoma qo'shimcha javoblari ── */}
      {(otherAnswers.length > 0 || editing) && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />So&apos;rovnoma javoblari
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(editAnswers).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                    </Label>
                    <Input value={value} onChange={(e) => setEditAnswers(p => ({ ...p, [key]: e.target.value }))} className="h-9" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherAnswers.map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;
                  return (
                    <div key={key} className="rounded-md border border-border bg-muted/20 p-3">
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      {isRating(key, value as string | number)
                        ? renderRating(value as string | number)
                        : <p className="text-sm font-medium whitespace-pre-wrap">{String(value)}</p>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Hujjat tekshiruvi (AI Verification) ── */}
      {student && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />Hujjat tekshiruvi
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={loadingVerifs}
                aria-label="Yangilash"
                title="Yangilash"
                onClick={() => loadVerifications(student.id, id)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingVerifs && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {loadingVerifs ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Yuklanmoqda…
              </div>
            ) : verifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <FileText className="h-8 w-8 opacity-30" />
                <span>Hujjat tekshiruvi topilmadi</span>
              </div>
            ) : (
              <div className="space-y-5">
                {verifications.map((v) => (
                  <VerificationCard
                    key={v.id}
                    verification={v}
                    canReview={isAdmin}
                    onReviewed={(updated) =>
                      setVerifications((prev) =>
                        prev.map((x) => (x.id === updated.id ? updated : x)),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
