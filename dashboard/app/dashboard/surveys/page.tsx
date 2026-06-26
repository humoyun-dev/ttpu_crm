"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  Pencil,
  RefreshCw,
  Search,
  Download,
  CalendarIcon,
  Filter,
  X,
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
import { bot2Api, catalogApi, Bot2SurveyResponse, DocVerificationStatus, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { formatCourseYearLabel, cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EMPLOYMENT_LABELS } from "@/lib/constants";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { PageHeader } from "@/components/page-header";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const FETCH_ALL_PAGE_SIZE = 500;

function DocStatusBadge({ status }: { status: DocVerificationStatus }) {
  if (status === "verified") {
    return (
      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
        Tasdiqlangan
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400">
        Ko&apos;rib chiqilmoqda
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-rose-500 border-rose-300 dark:text-rose-400">
      Hujjat yo&apos;q
    </Badge>
  );
}

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

/* Keep only the latest response per unique student (by Student ID). Used for
   stats and export — the table view uses server-side latest_only filter. */
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

interface ProgramOption {
  id: string;
  name: string;
}

interface SurveyFilters {
  gender: string;
  employment_status: string;
  course_year: string;
  program: string;
  latest_only: string;
  want_help: string;
  share_with_employers: string;
}

const EMPTY_FILTERS: SurveyFilters = {
  gender: "",
  employment_status: "",
  course_year: "",
  program: "",
  latest_only: "",
  want_help: "",
  share_with_employers: "",
};

function hasActiveFilters(f: SurveyFilters): boolean {
  return Object.values(f).some(Boolean);
}

export default function SurveysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();

  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [filters, setFilters] = useState<SurveyFilters>(EMPTY_FILTERS);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  // Full dataset for stats + export (always unfiltered for correct totals)
  const [allSurveys, setAllSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);

  // Date range export
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* ── load program list for filter dropdown ── */
  useEffect(() => {
    catalogApi.list("direction", { page_size: "200", ordering: "name_uz" }).then((res) => {
      if (res.data) {
        setPrograms(
          res.data.results.map((p) => ({ id: p.id, name: p.name_uz || p.name })),
        );
      }
    });
  }, []);

  /* ── build filter params for API calls ── */
  const buildFilterParams = useCallback(
    (extra?: Record<string, string>): Record<string, string> => {
      const params: Record<string, string> = { ordering: "-submitted_at", ...extra };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.gender) params.gender = filters.gender;
      if (filters.employment_status) params.employment_status = filters.employment_status;
      if (filters.course_year) params.course_year = filters.course_year;
      if (filters.program) params.program = filters.program;
      if (filters.latest_only) params.latest_only = filters.latest_only;
      if (filters.want_help) params.want_help = filters.want_help;
      if (filters.share_with_employers) params.share_with_employers = filters.share_with_employers;
      return params;
    },
    [debouncedSearch, filters],
  );

  /* ── load current page from server ── */
  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = buildFilterParams({
      page: String(currentPage),
      page_size: String(pageSize),
    });
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
  }, [currentPage, pageSize, buildFilterParams]);

  /* ── load whole dataset (stats + export) — always unfiltered ── */
  const fetchAll = useCallback(async () => {
    setAllLoaded(false);
    try {
      const all = await fetchAllSurveys({ ordering: "-submitted_at" });
      setAllSurveys(all);
      setAllLoaded(true);
    } catch {
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

  const handleFilterChange = (key: keyof SurveyFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
  };

  /* ── whole-dataset stats (unique students only) ── */
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

          {/* Filter bar */}
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Filterlar
              </span>
              {hasActiveFilters(filters) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                >
                  <X className="mr-1 h-3 w-3" />
                  Tozalash
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Jins */}
              <Select
                value={filters.gender || "_all"}
                onValueChange={(v) => handleFilterChange("gender", v === "_all" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Jins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Barcha jinslar</SelectItem>
                  <SelectItem value="male">Erkak</SelectItem>
                  <SelectItem value="female">Ayol</SelectItem>
                </SelectContent>
              </Select>

              {/* Ish holati */}
              <Select
                value={filters.employment_status || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("employment_status", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Ish holati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Barcha holat</SelectItem>
                  <SelectItem value="employed">Ishlamoqda</SelectItem>
                  <SelectItem value="unemployed">Ishlamaydi</SelectItem>
                </SelectContent>
              </Select>

              {/* Kurs */}
              <Select
                value={filters.course_year || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("course_year", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Kurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Barcha kurs</SelectItem>
                  <SelectItem value="1">1-kurs</SelectItem>
                  <SelectItem value="2">2-kurs</SelectItem>
                  <SelectItem value="3">3-kurs</SelectItem>
                  <SelectItem value="4">4-kurs</SelectItem>
                  <SelectItem value="5">Bitirgan</SelectItem>
                </SelectContent>
              </Select>

              {/* Yo'nalish */}
              <Select
                value={filters.program || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("program", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue placeholder="Yo'nalish" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Barcha yo&apos;nalish</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Unikal */}
              <Select
                value={filters.latest_only || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("latest_only", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Unikal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Barcha javoblar</SelectItem>
                  <SelectItem value="true">Oxirgi javob (unikal)</SelectItem>
                </SelectContent>
              </Select>

              {/* Yordam kerakmi */}
              <Select
                value={filters.want_help || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("want_help", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Yordam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Yordam (hammasi)</SelectItem>
                  <SelectItem value="true">Yordam kerak</SelectItem>
                  <SelectItem value="false">Kerak emas</SelectItem>
                </SelectContent>
              </Select>

              {/* Ma'lumot ulashish */}
              <Select
                value={filters.share_with_employers || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("share_with_employers", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Ma'lumot ulashish" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Ulashish (hammasi)</SelectItem>
                  <SelectItem value="true">Ulashishga rozi</SelectItem>
                  <SelectItem value="false">Rozi emas</SelectItem>
                </SelectContent>
              </Select>
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
                      <TableHead className="hidden md:table-cell">
                        Yo&apos;nalish
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Kurs
                      </TableHead>
                      <TableHead>Ishlaysizmi?</TableHead>
                      <TableHead className="hidden sm:table-cell">Hujjat</TableHead>
                      <TableHead className="hidden sm:table-cell">Sana</TableHead>
                      <TableHead className="w-20 sm:w-24">Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {surveys.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-muted-foreground"
                        >
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      surveys.map((survey) => {
                        const student = survey.student_details;
                        const programName =
                          survey.program_details?.name_uz ||
                          survey.program_details?.name ||
                          "-";

                        return (
                          <TableRow
                            key={survey.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/dashboard/surveys/${survey.id}`)}
                          >
                            <TableCell className="font-medium whitespace-nowrap">
                              <div>
                                {student
                                  ? `${student.first_name} ${student.last_name}`
                                  : "-"}
                              </div>
                              {student?.student_external_id && (
                                <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {student.student_external_id}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs hidden md:table-cell">
                              {programName}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell font-mono text-xs tabular-nums">
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
                            <TableCell className="hidden sm:table-cell">
                              <DocStatusBadge status={survey.doc_verification_status ?? "no_docs"} />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                              {formatDate(
                                survey.submitted_at || survey.created_at,
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
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
