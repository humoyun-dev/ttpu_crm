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
  Heart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { formatUzPhone } from "@/lib/utils";
import { bot1Api, FoundationRequest, formatDate, getItemName } from "@/lib/api";

const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  region: "Hudud",
  birth_date: "Tug'ilgan sana",
  school_name: "Maktab nomi",
  grade: "Sinf",
  graduation_year: "Bitirgan yili",
  family_status: "Oilaviy holat",
  family_income: "Oila daromadi",
  siblings_count: "Aka-uka/opa-singillar soni",
  parent_name: "Ota-ona ismi",
  parent_phone: "Ota-ona telefoni",
  parent_occupation: "Ota-ona kasbi",
  motivation: "Motivatsiya",
  achievements: "Yutuqlar",
  about_yourself: "O'zingiz haqingizda",
  additional_info: "Qo'shimcha ma'lumot",
  scholarship_reason: "Grant sababi",
  comment: "Izoh",
};

export default function FoundationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [request, setRequest] = useState<FoundationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const reqRes = await bot1Api.getFoundation(id);
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
  const region = applicant?.region_details;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Foundation Arizasi</h1>
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
                    {formatUzPhone(applicant?.phone) || "-"}
                  </p>
                </div>
              </div>
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
            {answers?.school_name && (
              <div>
                <p className="text-sm text-muted-foreground">Maktab nomi</p>
                <p className="font-medium">{answers.school_name}</p>
              </div>
            )}

            {answers?.grade && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Sinf</p>
                  <p className="font-medium">{answers.grade}-sinf</p>
                </div>
              </>
            )}

            {answers?.graduation_year && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Bitirgan yili</p>
                  <p className="font-medium">{answers.graduation_year}</p>
                </div>
              </>
            )}

            {answers?.achievements && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Yutuqlar</p>
                  <p className="font-medium whitespace-pre-wrap">
                    {answers.achievements}
                  </p>
                </div>
              </>
            )}

            <Separator />

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

        {/* Oila ma'lumotlari */}
        {(answers?.parent_name ||
          answers?.parent_phone ||
          answers?.family_status ||
          answers?.family_income) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Oila ma'lumotlari
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(answers?.parent_name || answers?.parent_phone) && (
                <div className="grid grid-cols-2 gap-4">
                  {answers?.parent_name && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Ota-ona ismi
                      </p>
                      <p className="font-medium">{answers.parent_name}</p>
                    </div>
                  )}
                  {answers?.parent_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Telefon</p>
                        <p className="font-medium">
                          {formatUzPhone(answers.parent_phone) || "-"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {answers?.parent_occupation && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Ota-ona kasbi
                    </p>
                    <p className="font-medium">{answers.parent_occupation}</p>
                  </div>
                </>
              )}

              {(answers?.family_status || answers?.siblings_count) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    {answers?.family_status && (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Oilaviy holat
                        </p>
                        <p className="font-medium">{answers.family_status}</p>
                      </div>
                    )}
                    {answers?.siblings_count && (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Aka-uka/opa-singillar
                        </p>
                        <p className="font-medium">
                          {answers.siblings_count} ta
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {answers?.family_income && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Oila daromadi
                    </p>
                    <p className="font-medium">{answers.family_income}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Qo'shimcha ma'lumotlar */}
        <Card
          className={
            answers?.parent_name || answers?.parent_phone ? "" : "md:col-span-2"
          }
        >
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
                    "school_name",
                    "grade",
                    "graduation_year",
                    "parent_name",
                    "parent_phone",
                    "parent_occupation",
                    "family_status",
                    "siblings_count",
                    "family_income",
                    "achievements",
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
                    <p className="mt-1 text-sm whitespace-pre-wrap">{value}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
