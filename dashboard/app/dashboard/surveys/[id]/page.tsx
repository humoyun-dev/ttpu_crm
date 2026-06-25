"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, User, GraduationCap, Clock, CheckCircle, FileText,
  Phone, MapPin, MessageSquare, Pencil, Save, X, Briefcase,
  Send, Languages, Calendar, Hash, Download, File,
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
  bot2Api, catalogApi, Bot2SurveyResponse, Bot2Student, Bot2Document, CatalogItem, formatDate,
} from "@/lib/api";
import { formatUzPhone } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { EMPLOYMENT_LABELS, CONSENT_LABELS, LABEL_TRANSLATIONS, courseYearLabel } from "@/lib/constants";

/* ── Info row ── */
function Row({ icon: Icon, label, children }: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-[120px] text-sm text-muted-foreground">{label}</span>
      <span className="flex-1 text-right text-sm font-medium">{children}</span>
    </div>
  );
}

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const surveyRes = await bot2Api.getSurvey(id);
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);
      if (!surveyRes.data) throw new Error("So'rovnoma topilmadi");
      setSurvey(surveyRes.data);
      populateSurveyForm(surveyRes.data);
      let resolvedStudent: Bot2Student | null = null;
      if (surveyRes.data.student_details) {
        resolvedStudent = surveyRes.data.student_details;
        setStudent(resolvedStudent);
        populateStudentForm(resolvedStudent);
      } else if (surveyRes.data.student) {
        const studentRes = await bot2Api.getStudent(surveyRes.data.student);
        if (studentRes.data) { resolvedStudent = studentRes.data; setStudent(resolvedStudent); populateStudentForm(resolvedStudent); }
      }
      // Load documents for this student
      if (resolvedStudent) {
        const docsRes = await bot2Api.listDocuments({ student: resolvedStudent.id });
        if (docsRes.data?.results) setDocuments(docsRes.data.results);
      }
      const regionsRes = await catalogApi.list("region");
      if (regionsRes.data?.results) setRegions(regionsRes.data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={fetchData} />;
  if (!survey) return <ErrorDisplay message="So'rovnoma topilmadi" />;

  const answers = (survey.answers as Record<string, string | number>) || {};
  const consents = (survey.consents as Record<string, boolean>) || {};
  const programName = survey.program_details?.name_uz || survey.program_details?.name || null;
  const regionName = student?.region_details?.name_uz || student?.region_details?.name || null;

  const englishLevel = answers.english_level as string;
  const russianLevel = answers.russian_level as string;
  const otherAnswers = Object.entries(answers).filter(([k]) => !["english_level", "russian_level", "region_label", "program_label", "course_year", "cv_doc_id", "cert_doc_id", "known_langs"].includes(k));

  const isEmployed = survey.employment_status === "employed";

  const studentFullName = student
    ? [student.first_name, student.last_name].filter(Boolean).join(" ").trim()
    : "";

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

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <PageHeader
        eyebrow="TALABALAR / SO'ROVNOMALAR"
        title={student ? studentFullName || "—" : "So'rovnoma"}
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
                    <Save className="mr-1 h-3.5 w-3.5" />{saving ? "Saqlanmoqda..." : "Saqlash"}
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

      {/* ── So'rovnoma metama'lumotlari ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-mono tabular-nums">
          <Hash className="h-3 w-3" />{String(survey.id).slice(0, 8)}
        </span>
        {survey.submitted_at && (
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <Send className="h-3 w-3" />
            {formatDate(survey.submitted_at, true)}
          </span>
        )}
      </div>

      {/* ── Row 1: Talaba + Ta'lim ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Talaba ma'lumotlari */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <User className="h-4 w-4" />Talaba
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
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
              <div className="divide-y">
                <Row label="To'liq ism">
                  <span className="font-semibold">{studentFullName || "—"}</span>
                </Row>
                <Row label="Jins">
                  {student?.gender === "male" ? "👨 Erkak" : student?.gender === "female" ? "👩 Ayol" : "—"}
                </Row>
                <Row icon={Hash} label="Student ID">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">{student?.student_external_id || "—"}</code>
                </Row>
                {student?.phone && (
                  <Row icon={Phone} label="Telefon">
                    <a href={`tel:${student.phone}`} className="font-mono tabular-nums text-primary hover:underline">{formatUzPhone(student.phone)}</a>
                  </Row>
                )}
                {regionName && (
                  <Row icon={MapPin} label="Viloyat">{regionName}</Row>
                )}
                {student?.username && (
                  <Row label="Telegram">
                    <a href={`https://t.me/${student.username}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">@{student.username}</a>
                  </Row>
                )}
                {student?.telegram_user_id && (
                  <Row label="Telegram ID">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">{student.telegram_user_id}</code>
                  </Row>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ta'lim va ish */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <GraduationCap className="h-4 w-4" />Ta&apos;lim va ish
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
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
                      <SelectItem value="employed">Ha</SelectItem>
                      <SelectItem value="unemployed">Yo&apos;q</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EditField label="Kompaniya" value={editSurvey.employment_company} onChange={(v) => setEditSurvey(p => ({ ...p, employment_company: v }))} />
                <EditField label="Lavozim" value={editSurvey.employment_role} onChange={(v) => setEditSurvey(p => ({ ...p, employment_role: v }))} />
              </div>
            ) : (
              <div className="divide-y">
                {programName && <Row icon={GraduationCap} label="Yo'nalish">{programName}</Row>}
                <Row label="Kurs">{courseYearLabel(survey.course_year)}</Row>
                <Row icon={Briefcase} label="Ishlaysizmi?">
                  <Badge variant={isEmployed ? "default" : "secondary"} className={isEmployed ? "bg-green-600 text-white text-xs" : "text-xs"}>
                    {EMPLOYMENT_LABELS[survey.employment_status] || survey.employment_status || "—"}
                  </Badge>
                </Row>
                {survey.employment_company && <Row label="Kompaniya">{survey.employment_company}</Row>}
                {survey.employment_role && <Row label="Lavozim">{survey.employment_role}</Row>}
                <div className="pt-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />Yaratilgan: <span className="font-mono tabular-nums">{formatDate(survey.created_at)}</span>
                  </div>
                  {survey.submitted_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Send className="h-3 w-3" />Yuborilgan: <span className="font-mono tabular-nums">{formatDate(survey.submitted_at, true)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />Yangilangan: <span className="font-mono tabular-nums">{formatDate(survey.updated_at)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Til darajalari + Roziliklar ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Til darajalari */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Languages className="h-4 w-4" />Til darajalari
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {englishLevel || russianLevel ? (
              <div className="divide-y">
                {englishLevel && (
                  <div className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2 text-sm">🇬🇧 Ingliz tili</span>
                    <Badge variant="outline" className="font-mono text-sm font-semibold tabular-nums">{englishLevel}</Badge>
                  </div>
                )}
                {russianLevel && (
                  <div className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2 text-sm">🇷🇺 Rus tili</span>
                    <Badge variant="outline" className="font-mono text-sm font-semibold tabular-nums">{russianLevel}</Badge>
                  </div>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Til darajasi kiritilmagan</p>
            )}
          </CardContent>
        </Card>

        {/* Roziliklar */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <CheckCircle className="h-4 w-4" />Roziliklar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {editing ? (
              <div className="space-y-2">
                {Object.entries(editConsents).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <span className="text-sm">{CONSENT_LABELS[key] || key.replace(/_/g, " ")}</span>
                    <Button variant={value ? "default" : "outline"} size="sm" className="h-7 text-xs"
                      onClick={() => setEditConsents(p => ({ ...p, [key]: !value }))}>
                      {value ? "Ha" : "Yo'q"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(consents).length > 0 ? Object.entries(consents).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <span className="text-sm">{CONSENT_LABELS[key] || key.replace(/_/g, " ")}</span>
                    <Badge variant={value ? "default" : "secondary"}
                      className={value ? "bg-green-600 text-white text-xs" : "text-xs"}>
                      {value ? "✓ Ha" : "✗ Yo'q"}
                    </Badge>
                  </div>
                )) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">Roziliklar yo&apos;q</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Takliflar ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <MessageSquare className="h-4 w-4" />Takliflar
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editing ? (
            <Textarea value={editSurvey.suggestions}
              onChange={(e) => setEditSurvey(p => ({ ...p, suggestions: e.target.value }))}
              placeholder="Universitet faoliyatini takomillashtirish bo'yicha takliflar..."
              className="min-h-[100px]" />
          ) : survey.suggestions ? (
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {survey.suggestions}
            </p>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Takliflar yo&apos;q</p>
          )}
        </CardContent>
      </Card>

      {/* ── Hujjatlar (CV va Sertifikat) ── */}
      {documents.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <File className="h-4 w-4" />Hujjatlar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {documents.map((doc) => {
                const label = doc.doc_type === "cv" ? "📄 CV / Rezyume" : "📜 Til sertifikati";
                const downloadUrl = bot2Api.documentDownloadUrl(doc.id);
                const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null;
                return (
                  <a
                    key={doc.id}
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 hover:bg-muted/40 transition-colors group"
                  >
                    <FileText className="h-8 w-8 shrink-0 text-primary/70" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.original_filename || "hujjat"}
                        {sizeKb ? ` · ${sizeKb} KB` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</p>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── So'rovnoma javoblari (qo'shimcha) ── */}
      {(otherAnswers.length > 0 || editing) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-4 w-4" />So&apos;rovnoma javoblari
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(editAnswers).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
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
                      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      {isRating(key, value as string | number) ? renderRating(value as string | number) : (
                        <p className="text-sm font-medium whitespace-pre-wrap">{String(value)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
