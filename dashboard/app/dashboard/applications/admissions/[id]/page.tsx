"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Calendar,
  GraduationCap,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot1Api,
  Admissions2026Application,
  formatDate,
  getItemName,
} from "@/lib/api";
import { formatUzPhone } from "@/lib/utils";

const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  region: "Hudud",
  birth_date: "Tug'ilgan sana",
  second_phone: "Qo'shimcha telefon",
  education_level: "Ta'lim darajasi",
  school_name: "Maktab nomi",
  grade: "Sinf",
  graduation_year: "Bitirgan yili",
  english_level: "Ingliz tili darajasi",
  math_level: "Matematika darajasi",
  motivation: "Motivatsiya",
  about_yourself: "O'zingiz haqingizda",
  comment: "Izoh",
  parent_phone: "Ota-ona telefoni",
  achievements: "Yutuqlar",
  programming_experience: "Dasturlash tajribasi",
  additional_info: "Qo'shimcha ma'lumot",
  first_name: "Ism",
  last_name: "Familiya",
};

/* Fields already shown in structured cards – skip in extras */
const DISPLAYED_FIELDS = new Set([
  "gender",
  "region",
  "birth_date",
  "second_phone",
  "first_name",
  "last_name",
]);

export default function AdmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [application, setApplication] =
    useState<Admissions2026Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const appRes = await bot1Api.getAdmission(id);
      if (appRes.error) throw new Error(appRes.error.message as string);
      if (!appRes.data) throw new Error("Ariza topilmadi");

      setApplication(appRes.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi",
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
  if (!application) return <ErrorDisplay message="Ariza topilmadi" />;

  const answers = application.answers as Record<string, string>;
  const applicant = application.applicant_details;
  const direction = application.direction_details;
  const track = application.track_details;
  const region = applicant?.region_details;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Ariza tafsilotlari</h1>
          <p className="text-muted-foreground">
            Qabul 2026 - #{id.slice(0, 8)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Applicant Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Shaxsiy ma'lumotlar
            </CardTitle>
            <CardDescription>Ariza beruvchi haqida</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Ism</p>
                <p className="font-medium">{applicant?.first_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Familiya</p>
                <p className="font-medium">{applicant?.last_name || "-"}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Jins</p>
                <GenderBadge gender={answers?.gender || "unspecified"} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tug'ilgan sana</p>
                <p className="font-medium">{answers?.birth_date || "-"}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Asosiy telefon</p>
                <p className="font-medium">{formatUzPhone(applicant?.phone)}</p>
              </div>
            </div>

            {answers?.second_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Qo'shimcha telefon
                  </p>
                  <p className="font-medium">
                    {formatUzPhone(answers.second_phone)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Hudud</p>
                <p className="font-medium">
                  {getItemName(region || undefined) || answers?.region || "-"}
                </p>
              </div>
            </div>

            {applicant?.username && (
              <div>
                <p className="text-sm text-muted-foreground">Telegram</p>
                <p className="font-medium">@{applicant.username}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Application Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Ariza ma'lumotlari
            </CardTitle>
            <CardDescription>Qabul haqida</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={application.status} />
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Yo'nalish</p>
              <p className="font-medium">
                {getItemName(direction || undefined)}
              </p>
            </div>

            {track && (
              <div>
                <p className="text-sm text-muted-foreground">Tarmoq</p>
                <p className="font-medium">{getItemName(track)}</p>
              </div>
            )}

            <Separator />

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Yuborilgan sana</p>
                <p className="font-medium">
                  {formatDate(application.submitted_at, true)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Yaratilgan sana</p>
                <p className="font-medium">
                  {formatDate(application.created_at, true)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Answers */}
        {Object.keys(answers).length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Qo&apos;shimcha ma&apos;lumotlar
              </CardTitle>
              <CardDescription>
                Foydalanuvchi tomonidan kiritilgan javoblar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(answers).map(([key, value]) => {
                  if (DISPLAYED_FIELDS.has(key)) return null;
                  if (!value) return null;

                  return (
                    <div
                      key={key}
                      className="rounded-lg border bg-muted/50 p-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {String(value)}
                      </p>
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
