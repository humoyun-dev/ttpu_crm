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
  Download,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
import { bot2Api, Bot2SurveyResponse, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { formatCourseYearLabel, cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EMPLOYMENT_LABELS, GENDER_LABELS } from "@/lib/constants";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const FETCH_ALL_PAGE_SIZE = 500;

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

/* Fetch every survey by looping through all pages (page_size capped at 500). */
async function fetchAllSurveys(
  params: Record<string, string>,
): Promise<Bot2SurveyResponse[]> {
  const all: Bot2SurveyResponse[] = [];
  let page = 1;
  // Safety cap to avoid an unbounded loop if `next` is mis-reported.
  for (let guard = 0; guard < 1000; guard += 1) {
    const res = await bot2Api.listSurveys({
      ...params,
      page: String(page),
      page_size: String(FETCH_ALL_PAGE_SIZE),
    });
    if (res.error) {
      throw new Error(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
    }
    const data = res.data;
    if (!data) break;
    all.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return all;
}

export default function SurveysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Current page of surveys (server-side pagination)
  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-side search + pagination state
  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Full dataset (all surveys) for whole-dataset stats + export
  const [allSurveys, setAllSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);

  // Date range export
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* ── load current page from server ── */
  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, string> = {
      page: String(currentPage),
      page_size: String(pageSize),
      ordering: "-submitted_at",
    };
    if (debouncedSearch) params.search = debouncedSearch;

    const res = await bot2Api.listSurveys(params);
    if (res.error) {
      setError(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      setLoading(false);
      return;
    }
    if (res.data) {
      setSurveys(res.data.results);
      setTotalCount(res.data.count);
    }
    setLoading(false);
  }, [currentPage, pageSize, debouncedSearch]);

  /* ── load whole dataset (stats + export) ── */
  const fetchAll = useCallback(async () => {
    setAllLoaded(false);
    try {
      const all = await fetchAllSurveys({ ordering: "-submitted_at" });
      setAllSurveys(all);
      setAllLoaded(true);
    } catch {
      // Stats/export remain unavailable; the table itself still works.
      setAllLoaded(false);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchPage();
    fetchAll();
  }, [fetchPage, fetchAll]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  /* ── whole-dataset stats ── */
  const employedCount = allSurveys.filter(
    (s) => s.employment_status === "employed",
  ).length;
  const unemployedCount = allSurveys.filter(
    (s) => s.employment_status === "unemployed",
  ).length;
  const campaignsCount = new Set(allSurveys.map((s) => s.survey_campaign)).size;

  /* ── date-filtered surveys for export (from full dataset) ── */
  const exportSurveys = (() => {
    let range: { from: Date | null; to: Date | null };
    if (datePreset === "custom") {
      range = {
        from: customFrom ?? null,
        to: customTo ? new Date(customTo.getTime() + 86400000) : null,
      };
    } else {
      range = getDateRange(datePreset);
    }

    return allSurveys.filter((s) => {
      if (!range.from && !range.to) return true;
      const d = new Date(s.submitted_at || s.created_at);
      if (range.from && d < range.from) return false;
      if (range.to && d >= range.to) return false;
      return true;
    });
  })();

  /* ── export to Excel ── */
  const handleExport = () => {
    if (!allLoaded) {
      toast.error("Ma'lumotlar hali yuklanmoqda, biroz kuting");
      return;
    }
    if (exportSurveys.length === 0) {
      toast.error("Eksport qilish uchun ma'lumot topilmadi");
      return;
    }
    setExporting(true);
    try {
      const rows = exportSurveys.map((survey) => {
        const student = survey.student_details;
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">So&apos;rovnomalar</h1>
          <p className="text-sm text-muted-foreground">
            Talabalar so&apos;rovnomalari natijalari
          </p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Yangilash
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Jami javoblar
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Kampaniyalar
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {allLoaded ? campaignsCount : "…"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Ishlamoqda
            </CardTitle>
            <Briefcase className="h-4 w-4 text-green-500 hidden sm:block" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {allLoaded ? employedCount : "…"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Ishlamaydi
            </CardTitle>
            <XCircle className="h-4 w-4 text-yellow-500 hidden sm:block" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {allLoaded ? unemployedCount : "…"}
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
            <div className="space-y-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">
                Vaqt oralig&apos;i
              </label>
              <Select
                value={datePreset}
                onValueChange={(v) => setDatePreset(v as DatePreset)}
              >
                <SelectTrigger className="w-full sm:w-44 h-9">
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
              disabled={exporting || !allLoaded || exportSurveys.length === 0}
              size="sm"
              className="h-9 w-full sm:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting
                ? "Yuklanmoqda..."
                : !allLoaded
                  ? "Yuklanmoqda..."
                  : `Eksport (${exportSurveys.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">
                So&apos;rovnomalar ro&apos;yxati
              </CardTitle>
              <CardDescription>Jami: {totalCount} ta javob</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ID yoki username bo'yicha qidirish..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableLoading />
          ) : error ? (
            <ErrorDisplay message={error} onRetry={fetchPage} />
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ism Familiya</TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Student ID
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Telefon
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Jins
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Viloyat
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Yo&apos;nalish
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Kurs
                      </TableHead>
                      <TableHead>Ishlaysizmi?</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Kompaniya
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Lavozim
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Yordam
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Kampaniya
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Takliflar
                      </TableHead>
                      <TableHead>Sana</TableHead>
                      <TableHead className="w-20 sm:w-24">Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {surveys.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={15}
                          className="text-center text-muted-foreground"
                        >
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      surveys.map((survey) => {
                        const student = survey.student_details;
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
                            <TableCell className="hidden xl:table-cell">
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {student?.student_external_id || "-"}
                              </code>
                            </TableCell>
                            <TableCell className="whitespace-nowrap hidden lg:table-cell">
                              {student?.phone ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  {student.phone}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">
                              {GENDER_LABELS[student?.gender || ""] ||
                                student?.gender ||
                                "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap hidden xl:table-cell">
                              {regionName !== "-" ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {regionName}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs hidden lg:table-cell">
                              {programName}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
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
                            <TableCell className="text-xs whitespace-nowrap hidden lg:table-cell">
                              {survey.employment_company || "-"}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap hidden xl:table-cell">
                              {survey.employment_role || "-"}
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">
                              {consents.want_help ? (
                                <Badge variant="outline" className="text-xs">
                                  Ha
                                </Badge>
                              ) : (
                                "Yo'q"
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-xs">
                                {survey.survey_campaign || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="max-w-50 truncate text-xs hidden xl:table-cell"
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
                                {isAdmin && (
                                  <Link
                                    href={`/dashboard/surveys/${survey.id}?edit=true`}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Tahrirlash"
                                      className="hidden sm:inline-flex"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalCount > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="hidden sm:inline">
                      {(currentPage - 1) * pageSize + 1}–
                      {Math.min(currentPage * pageSize, totalCount)} /{" "}
                      {totalCount}
                    </span>
                    <span className="sm:hidden text-xs">
                      {currentPage} / {totalPages} sahifa
                    </span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <span className="hidden sm:flex items-center gap-1 px-2 text-sm">
                      Sahifa{" "}
                      <strong>
                        {currentPage} / {totalPages}
                      </strong>
                    </span>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
