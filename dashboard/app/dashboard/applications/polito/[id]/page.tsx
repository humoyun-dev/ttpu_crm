"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  GraduationCap,
  Clock,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { formatUzPhone } from "@/lib/utils";
import {
  bot1Api,
  PolitoAcademyRequest,
  formatDate,
  getItemName,
} from "@/lib/api";

const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  region: "Hudud",
  birth_date: "Tug'ilgan sana",
  education_level: "Ta'lim darajasi",
  school_name: "Maktab nomi",
  grade: "Sinf",
  graduation_year: "Bitirgan yili",
  english_level: "Ingliz tili darajasi",
  math_level: "Matematika darajasi",
  programming_experience: "Dasturlash tajribasi",
  motivation: "Motivatsiya",
  about_yourself: "O'zingiz haqingizda",
  parent_phone: "Ota-ona telefoni",
  comment: "Izoh",
};

export default function PolitoAcademyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [request, setRequest] = useState<PolitoAcademyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const reqRes = await bot1Api.getPolito(id);
      if (reqRes.error) throw new Error(reqRes.error.message as string);
      if (!reqRes.data) throw new Error("Ariza topilmadi");

      setRequest(reqRes.data);
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
  if (!request) return <ErrorDisplay message="Ariza topilmadi" />;

  const answers = (request.answers as Record<string, string>) || {};
  const applicant = request.applicant_details;
  const subject = request.subject_details;
  const region = applicant?.region_details;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Polito Academy Arizasi</h1>
          <p className="text-muted-foreground">
            {applicant
              ? `${applicant.first_name} ${applicant.last_name}`
              : "Ariza ma'lumotlari"}
          </p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={request.status} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Shaxsiy ma'lumotlar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Shaxsiy ma'lumotlar
            </CardTitle>
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
                <p className="font-medium">
                  {answers?.birth_date ? formatDate(answers.birth_date) : "-"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Telefon</p>
                  <p className="font-medium">
                    {formatUzPhone(applicant?.phone)}
                  </p>
                </div>
              </div>
              {answers?.parent_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Ota-ona telefoni
                    </p>
                    <p className="font-medium">
                      {formatUzPhone(answers.parent_phone)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

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
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Telegram</p>
                  <p className="font-medium">@{applicant.username}</p>
                </div>
              </>
            )}

            {applicant?.telegram_user_id && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Telegram ID</p>
                  <p className="font-medium">{applicant.telegram_user_id}</p>
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
            {subject && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Tanlangan fan</p>
                  <Badge className="mt-1">{getItemName(subject)}</Badge>
                </div>
                <Separator />
              </>
            )}

            {(answers?.education_level ||
              answers?.school_name ||
              answers?.grade) && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {answers?.education_level && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Ta'lim darajasi
                      </p>
                      <p className="font-medium">{answers.education_level}</p>
                    </div>
                  )}
                  {answers?.grade && (
                    <div>
                      <p className="text-sm text-muted-foreground">Sinf</p>
                      <p className="font-medium">{answers.grade}-sinf</p>
                    </div>
                  )}
                </div>
                {answers?.school_name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Maktab nomi</p>
                    <p className="font-medium">{answers.school_name}</p>
                  </div>
                )}
                <Separator />
              </>
            )}

            {(answers?.english_level || answers?.math_level) && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {answers?.english_level && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Ingliz tili darajasi
                      </p>
                      <Badge variant="outline">{answers.english_level}</Badge>
                    </div>
                  )}
                  {answers?.math_level && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Matematika darajasi
                      </p>
                      <Badge variant="outline">{answers.math_level}</Badge>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Yaratilgan</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <p>{formatDate(request.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Yangilangan</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <p>{formatDate(request.updated_at)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Qo'shimcha ma'lumotlar */}
        {Object.keys(answers).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Qo'shimcha ma'lumotlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(answers).map(([key, value]) => {
                  // Skip already displayed fields
                  if (
                    [
                      "gender",
                      "region",
                      "birth_date",
                      "education_level",
                      "school_name",
                      "grade",
                      "english_level",
                      "math_level",
                      "parent_phone",
                    ].includes(key)
                  ) {
                    return null;
                  }
                  if (!value) return null;

                  return (
                    <div key={key} className="rounded-lg border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {value}
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
