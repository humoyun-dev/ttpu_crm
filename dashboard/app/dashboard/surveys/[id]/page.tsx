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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot2Api,
  Bot2SurveyResponse,
  Bot2Student,
  formatDate,
} from "@/lib/api";

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

      // Fetch student
      if (surveyRes.data.student) {
        const studentRes = await bot2Api.getStudent(surveyRes.data.student);
        if (studentRes.data) {
          setStudent(studentRes.data);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotni yuklab bo'lmadi"
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

  // Helper to render rating stars
  const renderRating = (value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(num)) return value;
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

  // Check if value looks like a rating (1-5)
  const isRating = (key: string, value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    return (
      !isNaN(num) &&
      num >= 1 &&
      num <= 5 &&
      (key.includes("rating") ||
        key.includes("satisfaction") ||
        [
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
        ].includes(key))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">So'rovnoma natijasi</h1>
          <p className="text-muted-foreground">
            {student
              ? `${student.first_name} ${student.last_name}`
              : "So'rovnoma ma'lumotlari"}
          </p>
        </div>
        <div className="ml-auto">
          {survey.is_complete ? (
            <Badge variant="default" className="bg-green-500">
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Talaba ma'lumotlari */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Talaba ma'lumotlari
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Ism</p>
                <p className="font-medium">{student?.first_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Familiya</p>
                <p className="font-medium">{student?.last_name || "-"}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Jins</p>
                <GenderBadge gender={student?.gender || "unspecified"} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tug'ilgan sana</p>
                <p className="font-medium">
                  {student?.birth_date ? formatDate(student.birth_date) : "-"}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Student ID</p>
              <code className="text-sm bg-muted px-2 py-1 rounded">
                {student?.student_external_id || "-"}
              </code>
            </div>

            {student?.telegram_user_id && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Telegram ID</p>
                  <p className="font-medium">{student.telegram_user_id}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Ta'lim ma'lumotlari */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Ta'lim ma'lumotlari
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Kampaniya</p>
              <Badge className="mt-1">{survey.survey_campaign || "-"}</Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              {survey.course_year && (
                <div>
                  <p className="text-sm text-muted-foreground">Kurs</p>
                  <p className="font-medium">{survey.course_year}-kurs</p>
                </div>
              )}
              {survey.employment_status && (
                <div>
                  <p className="text-sm text-muted-foreground">Ish holati</p>
                  <p className="font-medium">{survey.employment_status}</p>
                </div>
              )}
            </div>

            {survey.employment_company && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Kompaniya</p>
                  <p className="font-medium">{survey.employment_company}</p>
                </div>
              </>
            )}

            {survey.employment_role && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Lavozim</p>
                  <p className="font-medium">{survey.employment_role}</p>
                </div>
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Yaratilgan</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <p>{formatDate(survey.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Yangilangan</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <p>{formatDate(survey.updated_at)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* So'rovnoma javoblari */}
        {Object.keys(answers).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                So'rovnoma javoblari
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(answers).map(([key, value]) => {
                  if (value === null || value === undefined || value === "")
                    return null;

                  return (
                    <div key={key} className="rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground mb-1">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      {isRating(key, value) ? (
                        renderRating(value)
                      ) : (
                        <p className="font-medium whitespace-pre-wrap">
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
