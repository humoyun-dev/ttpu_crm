"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  Download,
  CalendarIcon,
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
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  bot2Api,
  Bot2SurveyResponse,
  Bot2Student,
  formatDate,
} from "@/lib/api";
import { formatCourseYearLabel, cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: "Ha",
  unemployed: "Yo'q",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Erkak",
  female: "Ayol",
};

type DatePreset = "all" | "today" | "week" | "month" | "year" | "custom";

function getDateRange(preset: DatePreset): {
  from: Date | null;
  to: Date | null;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 86400000) };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo, to: new Date(today.getTime() + 86400000) };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { from: monthAgo, to: new Date(today.getTime() + 86400000) };
    }
    case "year": {
      const yearAgo = new Date(today);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      return { from: yearAgo, to: new Date(today.getTime() + 86400000) };
    }
    default:
      return { from: null, to: null };
  }
}

function formatLocalDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [students, setStudents] = useState<Record<string, Bot2Student>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Date range export
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

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

  /* ── date-filtered surveys for export ── */
  const exportSurveys = useMemo(() => {
    let range: { from: Date | null; to: Date | null };
    if (datePreset === "custom") {
      range = {
        from: customFrom ?? null,
        to: customTo ? new Date(customTo.getTime() + 86400000) : null,
      };
    } else {
      range = getDateRange(datePreset);
    }

    return filteredSurveys.filter((s) => {
      if (!range.from && !range.to) return true;
      const d = new Date(s.submitted_at || s.created_at);
      if (range.from && d < range.from) return false;
      if (range.to && d >= range.to) return false;
      return true;
    });
  }, [filteredSurveys, datePreset, customFrom, customTo]);

  const campaigns = [...new Set(surveys.map((s) => s.survey_campaign))];

  /* ── export to Excel ── */
  const handleExport = () => {
    if (exportSurveys.length === 0) {
      toast.error("Eksport qilish uchun ma'lumot topilmadi");
      return;
    }
    setExporting(true);
    try {
      const rows = exportSurveys.map((survey) => {
        const student = survey.student_details || students[survey.student];
        const consents = (survey.consents as Record<string, boolean>) || {};
        const regionName =
          student?.region_details?.name_uz ||
          student?.region_details?.name ||
          "";
        const programName =
          survey.program_details?.name_uz || survey.program_details?.name || "";

        return {
          Ism: student?.first_name || "",
          Familiya: student?.last_name || "",
          "Student ID": student?.student_external_id || "",
          Telefon: student?.phone || "",
          Jins: GENDER_LABELS[student?.gender || ""] || student?.gender || "",
          Viloyat: regionName,
          "Telegram username": student?.username || "",
          "Telegram ID": student?.telegram_user_id || "",
          "Yo'nalish": programName,
          Kurs:
            survey.course_year === 5
              ? "Bitirgan"
              : survey.course_year
                ? `${survey.course_year}-kurs`
                : "",
          "Ishlaysizmi?":
            EMPLOYMENT_LABELS[survey.employment_status] ||
            survey.employment_status ||
            "",
          Kompaniya: survey.employment_company || "",
          Lavozim: survey.employment_role || "",
          "Yordam kerakmi?": consents.want_help ? "Ha" : "Yo'q",
          "Ma'lumot ulashish": consents.share_with_employers ? "Ha" : "Yo'q",
          Takliflar: survey.suggestions || "",
          Kampaniya: survey.survey_campaign || "",
          Sana: formatDate(survey.submitted_at || survey.created_at, true),
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      /* auto-width columns */
      const colKeys = Object.keys(rows[0] || {});
      ws["!cols"] = colKeys.map((key) => {
        const maxLen = Math.max(
          key.length,
          ...rows.map(
            (r) => String((r as Record<string, unknown>)[key] ?? "").length,
          ),
        );
        return { wch: Math.min(maxLen + 2, 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "So'rovnomalar");

      const presetLabels: Record<string, string> = {
        all: "barchasi",
        today: "bugun",
        week: "haftalik",
        month: "oylik",
        year: "yillik",
        custom: "maxsus",
      };
      const fileName = `sorovnomalar_${presetLabels[datePreset]}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`${exportSurveys.length} ta yozuv eksport qilindi`);
    } catch (err) {
      toast.error("Eksport qilishda xatolik yuz berdi");
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

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

      {/* Export section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Excel eksport</CardTitle>
          <CardDescription>
            Vaqt oralig&apos;ini tanlang va ma&apos;lumotlarni yuklab oling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Vaqt oralig&apos;i
              </label>
              <Select
                value={datePreset}
                onValueChange={(v) => setDatePreset(v as DatePreset)}
              >
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barchasi</SelectItem>
                  <SelectItem value="today">Bugun</SelectItem>
                  <SelectItem value="week">Haftalik</SelectItem>
                  <SelectItem value="month">Oylik</SelectItem>
                  <SelectItem value="year">Yillik</SelectItem>
                  <SelectItem value="custom">Maxsus oraliq</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {datePreset === "custom" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Dan</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-40 h-9 justify-start text-left font-normal",
                          !customFrom && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customFrom ? formatLocalDate(customFrom) : "Sana"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customFrom}
                        onSelect={setCustomFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Gacha</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-40 h-9 justify-start text-left font-normal",
                          !customTo && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customTo ? formatLocalDate(customTo) : "Sana"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customTo}
                        onSelect={setCustomTo}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            <Button
              onClick={handleExport}
              disabled={exporting || exportSurveys.length === 0}
              size="sm"
              className="h-9"
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting
                ? "Yuklanmoqda..."
                : `Eksport (${exportSurveys.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    <TableHead>Ishlaysizmi?</TableHead>
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Lavozim</TableHead>
                    <TableHead>Yordam</TableHead>
                    <TableHead>Kampaniya</TableHead>
                    <TableHead>Takliflar</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="w-24">Amal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={15}
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
                      const consents =
                        (survey.consents as Record<string, boolean>) || {};

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
                          <TableCell className="text-xs">
                            {GENDER_LABELS[student?.gender || ""] ||
                              student?.gender ||
                              "-"}
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
                          <TableCell className="text-xs">
                            {consents.want_help ? (
                              <Badge variant="outline" className="text-xs">
                                Ha
                              </Badge>
                            ) : (
                              "Yo'q"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {survey.survey_campaign || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="max-w-50 truncate text-xs"
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
