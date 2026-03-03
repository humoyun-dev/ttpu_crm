"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Eye,
  Pencil,
  RefreshCw,
  Search,
  ClipboardList,
  XCircle,
  Briefcase,
  Phone,
  MapPin,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/status-badge";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot2Api,
  Bot2SurveyResponse,
  Bot2Student,
  formatDate,
} from "@/lib/api";
import { formatCourseYearLabel } from "@/lib/utils";

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: "Ishlamoqda",
  unemployed: "Ishlamaydi",
  self_employed: "O'z ishi",
  student: "Talaba",
  intern: "Stajer",
  part_time: "Yarim stavka",
};

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [students, setStudents] = useState<Record<string, Bot2Student>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const surveyRes = await bot2Api.listSurveys();
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);

      const surveyList = surveyRes.data?.results || [];
      setSurveys(surveyList);

      const studentRes = await bot2Api.listStudents();
      const studentMap: Record<string, Bot2Student> = {};
      if (studentRes.data?.results) {
        studentRes.data.results.forEach((st) => {
          studentMap[st.id] = st;
        });
      }
      setStudents(studentMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredSurveys = surveys.filter((survey) => {
    if (!search) return true;
    const student = students[survey.student];
    const searchLower = search.toLowerCase();
    return (
      student?.first_name?.toLowerCase().includes(searchLower) ||
      student?.last_name?.toLowerCase().includes(searchLower) ||
      student?.student_external_id?.toLowerCase().includes(searchLower) ||
      student?.phone?.includes(searchLower) ||
      survey.survey_campaign?.toLowerCase().includes(searchLower) ||
      survey.employment_company?.toLowerCase().includes(searchLower) ||
      survey.employment_role?.toLowerCase().includes(searchLower) ||
      survey.suggestions?.toLowerCase().includes(searchLower)
    );
  });

  const campaigns = [...new Set(surveys.map((s) => s.survey_campaign))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">So&apos;rovnomalar</h1>
          <p className="text-muted-foreground">
            Talabalar so&apos;rovnomalari natijalari
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Yangilash
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jami javoblar</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{surveys.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kampaniyalar</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ishlamoqda</CardTitle>
            <Briefcase className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {surveys.filter((s) => s.employment_status === "employed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ishlamaydi</CardTitle>
            <XCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {
                surveys.filter((s) => s.employment_status === "unemployed")
                  .length
              }
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>So&apos;rovnomalar ro&apos;yxati</CardTitle>
              <CardDescription>Jami: {surveys.length} ta javob</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableLoading />
          ) : error ? (
            <ErrorDisplay message={error} onRetry={fetchData} />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ism Familiya</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Jins</TableHead>
                    <TableHead>Viloyat</TableHead>
                    <TableHead>Yo&apos;nalish</TableHead>
                    <TableHead>Kurs</TableHead>
                    <TableHead>Ish holati</TableHead>
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Lavozim</TableHead>
                    <TableHead>Kampaniya</TableHead>
                    <TableHead>Takliflar</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="w-[100px]">Amal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={14}
                        className="text-center text-muted-foreground"
                      >
                        Ma&apos;lumot topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSurveys.map((survey) => {
                      const student = students[survey.student];
                      const regionName =
                        student?.region_details?.name_uz ||
                        student?.region_details?.name ||
                        "-";
                      const programName =
                        survey.program_details?.name_uz ||
                        survey.program_details?.name ||
                        "-";

                      return (
                        <TableRow key={survey.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {student
                              ? `${student.first_name} ${student.last_name}`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {student?.student_external_id || "-"}
                            </code>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {student?.phone ? (
                              <span className="flex items-center gap-1 text-xs">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {student.phone}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <GenderBadge
                              gender={student?.gender || "unspecified"}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {regionName !== "-" ? (
                              <span className="flex items-center gap-1 text-xs">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {regionName}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {programName}
                          </TableCell>
                          <TableCell>
                            {formatCourseYearLabel(survey.course_year)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                survey.employment_status === "employed"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs whitespace-nowrap"
                            >
                              <Briefcase className="h-3 w-3 mr-1" />
                              {EMPLOYMENT_LABELS[survey.employment_status] ||
                                survey.employment_status ||
                                "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {survey.employment_company || "-"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {survey.employment_role || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {survey.survey_campaign || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="max-w-[200px] truncate text-xs"
                            title={survey.suggestions || ""}
                          >
                            {survey.suggestions || "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDate(
                              survey.submitted_at || survey.created_at,
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Link href={`/dashboard/surveys/${survey.id}`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ko'rish"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Link
                                href={`/dashboard/surveys/${survey.id}?edit=true`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Tahrirlash"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
