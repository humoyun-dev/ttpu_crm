"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  GraduationCap,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Briefcase,
  Phone,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot2Api,
  Bot2SurveyResponse,
  Bot2Student,
  formatDate,
} from "@/lib/api";
import { formatUzPhone } from "@/lib/utils";

/* ── human-readable label translations ── */
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
  employed: "Ishlamoqda",
  unemployed: "Ishlamaydi",
  self_employed: "O'z ishi",
  student: "Talaba",
  intern: "Stajer",
  part_time: "Yarim stavka",
};

const CONSENT_LABELS: Record<string, string> = {
  share_with_employers: "Ish beruvchilarga ulashish",
  want_help: "Yordam olishni xohlaydi",
  contact_permission: "Bog'lanish ruxsati",
  data_processing: "Ma'lumotlarni qayta ishlash",
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

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [survey, setSurvey] = useState<Bot2SurveyResponse | null>(null);
  const [student, setStudent] = useState<Bot2Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const surveyRes = await bot2Api.getSurvey(id);
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);
      if (!surveyRes.data) throw new Error("So'rovnoma topilmadi");

      setSurvey(surveyRes.data);

      // Use nested student_details if available, otherwise fetch separately
      if (surveyRes.data.student_details) {
        setStudent(surveyRes.data.student_details);
      } else if (surveyRes.data.student) {
        const studentRes = await bot2Api.getStudent(surveyRes.data.student);
        if (studentRes.data) setStudent(studentRes.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={fetchData} />;
  if (!survey) return <ErrorDisplay message="So'rovnoma topilmadi" />;

  const answers = (survey.answers as Record<string, string | number>) || {};
  const consents = (survey.consents as Record<string, boolean>) || {};

  /* ── resolve program name ── */
  const programName =
    survey.program_details?.name_uz || survey.program_details?.name || null;

  /* ── resolve region name ── */
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
        <div className="shrink-0">
          {survey.is_complete ? (
            <Badge variant="default" className="bg-green-600 text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Tugallangan
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="h-3 w-3 mr-1" />
              Jarayonda
            </Badge>
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
          <CardContent className="space-y-1 divide-y">
            <InfoRow label="Ism">
              {student?.first_name || "-"} {student?.last_name || ""}
            </InfoRow>
            <InfoRow label="Jins">
              <GenderBadge gender={student?.gender || "unspecified"} />
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
              <InfoRow label="Telegram ID">{student.telegram_user_id}</InfoRow>
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
          <CardContent className="space-y-1 divide-y">
            {programName && <InfoRow label="Yo'nalish">{programName}</InfoRow>}
            <InfoRow label="Kurs">
              {courseYearLabel(survey.course_year)}
            </InfoRow>
            <InfoRow label="Kampaniya">
              <Badge variant="outline" className="text-xs">
                {survey.survey_campaign || "-"}
              </Badge>
            </InfoRow>

            {/* Employment */}
            <InfoRow label="Ish holati">
              <Badge
                variant={
                  survey.employment_status === "employed"
                    ? "default"
                    : "secondary"
                }
                className="text-xs"
              >
                <Briefcase className="h-3 w-3 mr-1" />
                {EMPLOYMENT_LABELS[survey.employment_status] ||
                  survey.employment_status ||
                  "-"}
              </Badge>
            </InfoRow>
            {survey.employment_company && (
              <InfoRow label="Kompaniya">{survey.employment_company}</InfoRow>
            )}
            {survey.employment_role && (
              <InfoRow label="Lavozim">{survey.employment_role}</InfoRow>
            )}

            {/* Timestamps */}
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Roziliklar (Consents) ─── */}
        {Object.keys(consents).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle className="h-4 w-4" />
                Roziliklar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(consents).map(([key, value]) => (
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
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Takliflar ─── */}
        {survey.suggestions && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Takliflar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {survey.suggestions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── So'rovnoma javoblari ─── */}
        {Object.keys(answers).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                So&apos;rovnoma javoblari
              </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
