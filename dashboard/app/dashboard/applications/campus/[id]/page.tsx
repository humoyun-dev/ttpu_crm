"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  Calendar,
  Building,
  Clock,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, GenderBadge } from "@/components/status-badge";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { bot1Api, CampusTourRequest, formatDate, getItemName } from "@/lib/api";

const LABEL_TRANSLATIONS: Record<string, string> = {
  gender: "Jins",
  region: "Hudud",
  organization: "Tashkilot",
  organization_position: "Lavozim",
  visitor_count: "Tashrif buyuruvchilar soni",
  second_phone: "Qo'shimcha telefon",
  birth_date: "Tug'ilgan sana",
  comment: "Izoh",
  purpose: "Maqsad",
  questions: "Savollar",
};

export default function CampusTourDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [request, setRequest] = useState<CampusTourRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const reqRes = await bot1Api.getCampusTour(id);
      if (reqRes.error) throw new Error(reqRes.error.message as string);
      if (!reqRes.data) throw new Error("So'rov topilmadi");

      setRequest(reqRes.data);
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
  if (!request) return <ErrorDisplay message="So'rov topilmadi" />;

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
          <h1 className="text-2xl font-bold">Campus Tour So'rovi</h1>
          <p className="text-muted-foreground">
            {applicant
              ? `${applicant.first_name} ${applicant.last_name}`
              : "So'rov ma'lumotlari"}
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
                <p className="font-medium">
                  {applicant?.first_name || answers?.first_name || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Familiya</p>
                <p className="font-medium">
                  {applicant?.last_name || answers?.last_name || "-"}
                </p>
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
                  <p className="text-sm text-muted-foreground">
                    Asosiy telefon
                  </p>
                  <p className="font-medium">{applicant?.phone || "-"}</p>
                </div>
              </div>
              {answers?.second_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Qo'shimcha telefon
                    </p>
                    <p className="font-medium">{answers.second_phone}</p>
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

        {/* Tashrif ma'lumotlari */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tashrif ma'lumotlari
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Kelib ko'rish sanasi
                </p>
                <p className="font-medium text-primary">
                  {formatDate(request.preferred_date)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Tashrif buyuruvchilar soni
                </p>
                <p className="font-medium">
                  {answers?.visitor_count || "1"} kishi
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Tashkilot</p>
                <p className="font-medium">{answers?.organization || "-"}</p>
              </div>
            </div>

            {answers?.organization_position && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Lavozim</p>
                  <p className="font-medium">{answers.organization_position}</p>
                </div>
              </div>
            )}

            {answers?.purpose && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Tashrif maqsadi
                  </p>
                  <p className="font-medium">{answers.purpose}</p>
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

        {/* Qo'shimcha ma'lumotlar */}
        {Object.keys(answers).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
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
                      "organization",
                      "organization_position",
                      "visitor_count",
                      "second_phone",
                      "birth_date",
                      "first_name",
                      "last_name",
                      "purpose",
                    ].includes(key)
                  ) {
                    return null;
                  }
                  return (
                    <div key={key} className="rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground">
                        {LABEL_TRANSLATIONS[key] || key.replace(/_/g, " ")}
                      </p>
                      <p className="font-medium">{value || "-"}</p>
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
