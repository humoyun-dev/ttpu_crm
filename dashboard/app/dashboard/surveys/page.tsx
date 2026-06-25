"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Eye,
  Pencil,
  RefreshCw,
  Search,
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
import { bot2Api, Bot2SurveyResponse, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { formatCourseYearLabel, cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EMPLOYMENT_LABELS, GENDER_LABELS } from "@/lib/constants";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { PageHeader } from "@/components/page-header";

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

/* Is `a` a more recent response than `b`? Latest submitted_at wins, falling
   back to created_at, then id — mirrors the backend `_latest_responses_qs`
   tiebreakers (-submitted_at, -created_at, -id). */
function isNewerResponse(
  a: Bot2SurveyResponse,
  b: Bot2SurveyResponse,
): boolean {
  const ta = new Date(a.submitted_at || a.created_at).getTime();
  const tb = new Date(b.submitted_at || b.created_at).getTime();
  if (ta !== tb) return ta > tb;
  return String(a.id) > String(b.id);
}

/* Keep only the latest response per unique student (by Student ID). A student
   may submit the survey several times; stats and export should count each
   student once, using their most recent submission. */
function dedupeLatestByStudent(
  list: Bot2SurveyResponse[],
): Bot2SurveyResponse[] {
  const byStudent = new Map<string, Bot2SurveyResponse>();
  for (const s of list) {
    const key = s.student_details?.student_external_id || s.student;
    const existing = byStudent.get(key);
    if (!existing || isNewerResponse(s, existing)) {
      byStudent.set(key, s);
    }
  }
  return Array.from(byStudent.values());
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

  /* ── whole-dataset stats (unique students only — latest response per ID) ── */
  const uniqueSurveys = dedupeLatestByStudent(allSurveys);
  const uniqueStudentsCount = uniqueSurveys.length;
  const employedCount = uniqueSurveys.filter(
    (s) => s.employment_status === "employed",
  ).length;
  const unemployedCount = uniqueSurveys.filter(
    (s) => s.employment_status === "unemployed",
  ).length;

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

    const inRange = allSurveys.filter((s) => {
      if (!range.from && !range.to) return true;
      const d = new Date(s.submitted_at || s.created_at);
      if (range.from && d < range.from) return false;
      if (range.to && d >= range.to) return false;
      return true;
    });
    // Keep only the latest response per student within the selected range.
    return dedupeLatestByStudent(inRange);
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
      <PageHeader
        eyebrow="Talabalar / So'rovnomalar"
        title="So'rovnomalar"
        description="Talabalar so'rovnomalari natijalari reesti."
        actions={
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Yangilash
          </Button>
        }
      />

      {/* Reestr-uslubidagi statistika */}
      <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border lg:grid-cols-4">
        <div className="px-4 py-3.5">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {allLoaded ? uniqueStudentsCount.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Unikal talabalar
          </p>
        </div>
        <div className="border-l border-border px-4 py-3.5 max-lg:border-t">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-500">
            {allLoaded ? employedCount.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Ishlamoqda
          </p>
        </div>
        <div className="border-l border-border px-4 py-3.5 max-lg:border-t">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {allLoaded ? unemployedCount.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Ishlamaydi
          </p>
        </div>
      </section>

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
              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Dan
                  </label>
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
                  <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Gacha
                  </label>
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
              {exporting ? (
                "Yuklanmoqda..."
              ) : !allLoaded ? (
                "Yuklanmoqda..."
              ) : (
                <>
                  Eksport (
                  <span className="font-mono tabular-nums">
                    {exportSurveys.length}
                  </span>
                  )
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">So&apos;rovnomalar ro&apos;yxati</CardTitle>
              <CardDescription className="text-xs">
                Jami:{" "}
                <span className="font-mono tabular-nums">{totalCount}</span> ta
                javob
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="ID yoki username bo'yicha..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><TableLoading /></div>
          ) : error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={fetchPage} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
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
                            <TableCell className="hidden xl:table-cell font-mono text-xs tabular-nums text-muted-foreground">
                              {student?.student_external_id || "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap hidden lg:table-cell">
                              {student?.phone ? (
                                <span className="flex items-center gap-1 font-mono text-xs tabular-nums">
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
                            <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums">
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
                            <TableCell
                              className="max-w-50 truncate text-xs hidden xl:table-cell"
                              title={survey.suggestions || ""}
                            >
                              {survey.suggestions || "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
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

              {totalCount > pageSize && (
                <PaginationBar
                  page={currentPage}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
