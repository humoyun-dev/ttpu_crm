"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  GraduationCap,
  Clock,
  CheckCircle,
  FileText,
  Phone,
  MapPin,
  MessageSquare,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bot2Api,
  catalogApi,
  Bot2SurveyResponse,
  Bot2Student,
  CatalogItem,
  formatDate,
} from "@/lib/api";
import { formatUzPhone } from "@/lib/utils";
import { toast } from "sonner";

/* ── label translations ── */
const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  birth_date: "Tug'ilgan sana",
  year: "Kurs",
  group: "Guruh",
  direction: "Yo'nalish",
  satisfaction: "Qoniqish darajasi",
  feedback: "Fikr-mulohaza",
  rating: "Baho",
  dormitory: "Yotoqxona",
  transport: "Transport",
  food: "Ovqatlanish",
  library: "Kutubxona",
  sports: "Sport",
  wifi: "WiFi",
  cleanliness: "Tozalik",
  security: "Xavfsizlik",
  teachers: "O'qituvchilar",
  materials: "Materiallar",
  schedule: "Dars jadvali",
  facilities: "Jihozlar",
  comment: "Izoh",
  suggestion: "Taklif",
  complaint: "Shikoyat",
  question: "Savol",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: "Ha",
  unemployed: "Yo'q",
};

const CONSENT_LABELS: Record<string, string> = {
  share_with_employers: "Ma'lumotlarni ish beruvchilarga ulashish",
  want_help: "Universitet ish topishda yordam bersinmi",
};

function courseYearLabel(year: number | null | undefined): string {
  if (!year) return "-";
  if (year === 5) return "Bitirgan";
  return `${year}-kurs`;
}

/* ── small info row component ── */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

/* ── edit field component ── */
function EditField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        className="h-9"
      />
    </div>
  );
}

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [survey, setSurvey] = useState<Bot2SurveyResponse | null>(null);
  const [student, setStudent] = useState<Bot2Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);

  // Catalog data for dropdowns
  const [regions, setRegions] = useState<CatalogItem[]>([]);

  // Edit form state
  const [editStudent, setEditStudent] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    gender: "unspecified" as string,
    username: "",
    region: "" as string,
  });
  const [editSurvey, setEditSurvey] = useState({
    employment_status: "",
    employment_company: "",
    employment_role: "",
    suggestions: "",
    survey_campaign: "",
    course_year: 1 as number,
  });
  const [editConsents, setEditConsents] = useState<Record<string, boolean>>({
    want_help: false,
    share_with_employers: false,
  });
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

      if (surveyRes.data.student_details) {
        setStudent(surveyRes.data.student_details);
        populateStudentForm(surveyRes.data.student_details);
      } else if (surveyRes.data.student) {
        const studentRes = await bot2Api.getStudent(surveyRes.data.student);
        if (studentRes.data) {
          setStudent(studentRes.data);
          populateStudentForm(studentRes.data);
        }
      }

      // Fetch regions for dropdown
      const regionsRes = await catalogApi.list("region");
      if (regionsRes.data?.results) setRegions(regionsRes.data.results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  function populateSurveyForm(s: Bot2SurveyResponse) {
    setEditSurvey({
      employment_status: s.employment_status || "",
      employment_company: s.employment_company || "",
      employment_role: s.employment_role || "",
      suggestions: s.suggestions || "",
      survey_campaign: s.survey_campaign || "",
      course_year: s.course_year || 1,
    });
    const existingConsents = (s.consents as Record<string, boolean>) || {};
    setEditConsents({
      want_help: existingConsents.want_help ?? false,
      share_with_employers: existingConsents.share_with_employers ?? false,
      ...existingConsents,
    });
    const existingAnswers = (s.answers as Record<string, string>) || {};
    const strAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(existingAnswers)) {
      strAnswers[k] = String(v ?? "");
    }
    setEditAnswers(strAnswers);
  }

  function populateStudentForm(st: Bot2Student) {
    setEditStudent({
      first_name: st.first_name || "",
      last_name: st.last_name || "",
      phone: st.phone || "",
      gender: st.gender || "unspecified",
      username: st.username || "",
      region: st.region || "",
    });
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!survey) return;
    setSaving(true);

    try {
      // Update student
      if (student) {
        const studentPayload: Partial<Bot2Student> = {
          first_name: editStudent.first_name,
          last_name: editStudent.last_name,
          phone: editStudent.phone,
          gender: editStudent.gender as Bot2Student["gender"],
          username: editStudent.username,
        };
        if (editStudent.region) {
          studentPayload.region = editStudent.region;
        }
        const studentRes = await bot2Api.updateStudent(
          student.id,
          studentPayload,
        );
        if (studentRes.error)
          throw new Error(studentRes.error.message as string);
        if (studentRes.data) setStudent(studentRes.data);
      }

      // Update survey
      const surveyRes = await bot2Api.updateSurvey(survey.id, {
        employment_status: editSurvey.employment_status,
        employment_company: editSurvey.employment_company,
        employment_role: editSurvey.employment_role,
        suggestions: editSurvey.suggestions,
        survey_campaign: editSurvey.survey_campaign,
        course_year: editSurvey.course_year,
        consents: editConsents,
        answers: editAnswers,
      });
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);
      if (surveyRes.data) {
        setSurvey(surveyRes.data);
        populateSurveyForm(surveyRes.data);
      }

      toast.success("Ma'lumotlar saqlandi");
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (survey) populateSurveyForm(survey);
    if (student) populateStudentForm(student);
    setEditing(false);
  };

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={fetchData} />;
  if (!survey) return <ErrorDisplay message="So'rovnoma topilmadi" />;

  const answers = (survey.answers as Record<string, string | number>) || {};
  const consents = (survey.consents as Record<string, boolean>) || {};

  const programName =
    survey.program_details?.name_uz || survey.program_details?.name || null;
  const regionName =
    student?.region_details?.name_uz || student?.region_details?.name || null;

  /* ── rating helpers ── */
  const renderRating = (value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(num)) return <span>{String(value)}</span>;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={num >= star ? "text-yellow-400" : "text-gray-300"}
          >
            ★
          </span>
        ))}
        <span className="ml-1 text-sm text-muted-foreground">({num}/5)</span>
      </div>
    );
  };

  const RATING_KEYS = new Set([
    "dormitory",
    "transport",
    "food",
    "library",
    "sports",
    "wifi",
    "cleanliness",
    "security",
    "teachers",
    "materials",
    "schedule",
    "facilities",
  ]);

  const isRating = (key: string, value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    return (
      !isNaN(num) &&
      num >= 1 &&
      num <= 5 &&
      (key.includes("rating") ||
        key.includes("satisfaction") ||
        RATING_KEYS.has(key))
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold truncate">
            {student
              ? `${student.first_name} ${student.last_name}`
              : "So'rovnoma natijasi"}
          </h1>
          <p className="text-sm text-muted-foreground">
            So&apos;rovnoma #{String(survey.id).slice(0, 8)} &middot;{" "}
            {survey.survey_campaign || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-1" />
                Bekor qilish
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Tahrirlash
            </Button>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* ─── Talaba ma'lumotlari ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Talaba ma&apos;lumotlari
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                <EditField
                  label="Ism"
                  value={editStudent.first_name}
                  onChange={(v) =>
                    setEditStudent((p) => ({ ...p, first_name: v }))
                  }
                />
                <EditField
                  label="Familiya"
                  value={editStudent.last_name}
                  onChange={(v) =>
                    setEditStudent((p) => ({ ...p, last_name: v }))
                  }
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Jins</Label>
                  <Select
                    value={editStudent.gender}
                    onValueChange={(v) =>
                      setEditStudent((p) => ({ ...p, gender: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Erkak</SelectItem>
                      <SelectItem value="female">Ayol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EditField
                  label="Telefon"
                  value={editStudent.phone}
                  onChange={(v) => setEditStudent((p) => ({ ...p, phone: v }))}
                  type="tel"
                />
                <EditField
                  label="Telegram username"
                  value={editStudent.username}
                  onChange={(v) =>
                    setEditStudent((p) => ({ ...p, username: v }))
                  }
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Viloyat (yashash manzili)
                  </Label>
                  <Select
                    value={editStudent.region || ""}
                    onValueChange={(v) =>
                      setEditStudent((p) => ({ ...p, region: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Viloyatni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name_uz || r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Read-only fields in edit mode */}
                <div className="pt-2 space-y-1 border-t text-sm text-muted-foreground">
                  <div>
                    Student ID:{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      {student?.student_external_id || "-"}
                    </code>
                  </div>
                  {student?.telegram_user_id && (
                    <div>Telegram ID: {student.telegram_user_id}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1 divide-y">
                <InfoRow label="Ism">
                  {student?.first_name || "-"} {student?.last_name || ""}
                </InfoRow>
                <InfoRow label="Jins">
                  {student?.gender === "male"
                    ? "Erkak"
                    : student?.gender === "female"
                      ? "Ayol"
                      : "-"}
                </InfoRow>
                <InfoRow label="Tug'ilgan sana">
                  {student?.birth_date ? formatDate(student.birth_date) : "-"}
                </InfoRow>
                <InfoRow label="Student ID">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {student?.student_external_id || "-"}
                  </code>
                </InfoRow>
                {student?.phone && (
                  <InfoRow label="Telefon">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {formatUzPhone(student.phone)}
                    </span>
                  </InfoRow>
                )}
                {regionName && (
                  <InfoRow label="Viloyat">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {regionName}
                    </span>
                  </InfoRow>
                )}
                {student?.username && (
                  <InfoRow label="Telegram">@{student.username}</InfoRow>
                )}
                {student?.telegram_user_id && (
                  <InfoRow label="Telegram ID">
                    {student.telegram_user_id}
                  </InfoRow>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Ta'lim va ish ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Ta&apos;lim va ish holati
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                {/* Education info */}
                {programName && (
                  <div className="text-sm pb-2 border-b">
                    <span className="text-muted-foreground">
                      Yo&apos;nalish:{" "}
                    </span>
                    {programName}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Kurs</Label>
                  <Select
                    value={String(editSurvey.course_year)}
                    onValueChange={(v) =>
                      setEditSurvey((p) => ({
                        ...p,
                        course_year: parseInt(v),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1-kurs</SelectItem>
                      <SelectItem value="2">2-kurs</SelectItem>
                      <SelectItem value="3">3-kurs</SelectItem>
                      <SelectItem value="4">4-kurs</SelectItem>
                      <SelectItem value="5">Bitirgan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Hozirda ishlaysizmi?
                  </Label>
                  <Select
                    value={editSurvey.employment_status}
                    onValueChange={(v) =>
                      setEditSurvey((p) => ({ ...p, employment_status: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employed">Ha</SelectItem>
                      <SelectItem value="unemployed">Yo&apos;q</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EditField
                  label="Kompaniya"
                  value={editSurvey.employment_company}
                  onChange={(v) =>
                    setEditSurvey((p) => ({ ...p, employment_company: v }))
                  }
                />
                <EditField
                  label="Lavozim"
                  value={editSurvey.employment_role}
                  onChange={(v) =>
                    setEditSurvey((p) => ({ ...p, employment_role: v }))
                  }
                />
                <EditField
                  label="Kampaniya"
                  value={editSurvey.survey_campaign}
                  onChange={(v) =>
                    setEditSurvey((p) => ({ ...p, survey_campaign: v }))
                  }
                />
              </div>
            ) : (
              <div className="space-y-1 divide-y">
                {programName && (
                  <InfoRow label="Yo'nalish">{programName}</InfoRow>
                )}
                <InfoRow label="Kurs">
                  {courseYearLabel(survey.course_year)}
                </InfoRow>
                <InfoRow label="Kampaniya">
                  <Badge variant="outline" className="text-xs">
                    {survey.survey_campaign || "-"}
                  </Badge>
                </InfoRow>
                <InfoRow label="Ishlaysizmi?">
                  <Badge
                    variant={
                      survey.employment_status === "employed"
                        ? "default"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {EMPLOYMENT_LABELS[survey.employment_status] ||
                      survey.employment_status ||
                      "-"}
                  </Badge>
                </InfoRow>
                {survey.employment_company && (
                  <InfoRow label="Kompaniya">
                    {survey.employment_company}
                  </InfoRow>
                )}
                {survey.employment_role && (
                  <InfoRow label="Lavozim">{survey.employment_role}</InfoRow>
                )}
                <div className="pt-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Yaratilgan: {formatDate(survey.created_at)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Yangilangan: {formatDate(survey.updated_at)}
                    </div>
                    {survey.submitted_at && (
                      <div className="flex items-center gap-1 col-span-2">
                        <CheckCircle className="h-3 w-3" />
                        Yuborilgan: {formatDate(survey.submitted_at, true)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Roziliklar (Consents) ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-4 w-4" />
              Roziliklar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-2">
                {Object.entries(editConsents).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">
                      {CONSENT_LABELS[key] || key.replace(/_/g, " ")}
                    </span>
                    <Button
                      variant={value ? "default" : "secondary"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditConsents((p) => ({ ...p, [key]: !value }))
                      }
                    >
                      {value ? "Ha" : "Yo'q"}
                    </Button>
                  </div>
                ))}
                {Object.keys(editConsents).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Roziliklar yo&apos;q
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(consents).length > 0 ? (
                  Object.entries(consents).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">
                        {CONSENT_LABELS[key] || key.replace(/_/g, " ")}
                      </span>
                      {value ? (
                        <Badge
                          variant="default"
                          className="bg-green-600 text-white text-xs"
                        >
                          Ha
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Yo&apos;q
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Roziliklar yo&apos;q
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Takliflar ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />
              Takliflar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                value={editSurvey.suggestions}
                onChange={(e) =>
                  setEditSurvey((p) => ({ ...p, suggestions: e.target.value }))
                }
                placeholder="Universitet faoliyatini takomillashtirish bo'yicha takliflar..."
                className="min-h-25"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {survey.suggestions || (
                  <span className="text-muted-foreground">
                    Takliflar yo&apos;q
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ─── So'rovnoma javoblari ─── */}
        {(Object.keys(answers).length > 0 || editing) && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                So&apos;rovnoma javoblari
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(editAnswers).map(([key, value]) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </Label>
                      <Input
                        value={value}
                        onChange={(e) =>
                          setEditAnswers((p) => ({
                            ...p,
                            [key]: e.target.value,
                          }))
                        }
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(answers).map(([key, value]) => {
                    if (value === null || value === undefined || value === "")
                      return null;

                    return (
                      <div key={key} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide">
                          {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                        </p>
                        {isRating(key, value as string | number) ? (
                          renderRating(value as string | number)
                        ) : (
                          <p className="text-sm font-medium whitespace-pre-wrap">
                            {String(value)}
                          </p>
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
    </div>
  );
}
