"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Inbox,
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
import { TableLoading } from "@/components/loading";
import { DocStatusBadge, EmploymentBadge } from "@/components/status-badge";
import { EmptyStateRow } from "@/components/empty-state";
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
import { bot2Api, catalogApi, Bot2SurveyResponse, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { cn, toLocalDateString, addDaysToDateString } from "@/lib/utils";
import { toast } from "sonner";
import { EMPLOYMENT_LABELS, courseYearLabel } from "@/lib/constants";
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
  doc_status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: SurveyFilters = {
  gender: "",
  employment_status: "",
  course_year: "",
  program: "",
  latest_only: "",
  want_help: "",
  share_with_employers: "",
  doc_status: "",
  from: "",
  to: "",
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

  // Server tomonida hisoblangan statistika (har bir talabaning eng oxirgi javobi)
  const [stats, setStats] = useState<{
    unique_students: number;
    employed: number;
    unemployed: number;
  } | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

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
      if (filters.doc_status) params.doc_status = filters.doc_status;
      // Server naive sanani UTC deb qabul qiladi (parse_iso_datetime) — bare
      // YYYY-MM-DD yuborsak Toshkent (UTC+5) uchun chegara 05:00 ga suriladi.
      // Shuning uchun MAHALLIY yarim tunni to'liq ISO instant sifatida yuboramiz.
      if (filters.from) params.from = new Date(filters.from + "T00:00:00").toISOString();
      // `to` — tanlangan kun to'liq qamralishi uchun keyingi kun (exclusive) mahalliy
      // yarim tuni.
      if (filters.to) params.to = new Date(addDaysToDateString(filters.to, 1) + "T00:00:00").toISOString();
      return params;
    },
    [debouncedSearch, filters],
  );

  /* ── load current page from server ── */
  const fetchSeq = useRef(0);
  const fetchPage = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    const params = buildFilterParams({
      page: String(currentPage),
      page_size: String(pageSize),
    });
    const res = await bot2Api.listSurveys(params);
    // Eskirgan javob — yangiroq so'rov yuborilgan, natijani e'tiborsiz qoldiramiz.
    if (seq !== fetchSeq.current) return;
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

  /* ── stats: serverdagi tayyor endpoint (har bir talabaning oxirgi javobi) ── */
  const fetchStats = useCallback(async () => {
    setStatsError(null);
    const res = await bot2Api.surveyStats();
    if (res.error) {
      setStats(null);
      setStatsError(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      return;
    }
    setStats(res.data ?? null);
  }, []);

  const refresh = useCallback(() => {
    fetchPage();
    fetchStats();
  }, [fetchPage, fetchStats]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

  /* ── export to Excel — to'liq ma'lumot faqat bosilganda yuklanadi ── */
  const handleExport = async () => {
    setExporting(true);
    try {
      let range: { from: Date | null; to: Date | null };
      if (datePreset === "custom") {
        range = {
          from: customFrom ?? null,
          to: customTo ? new Date(customTo.getTime() + 86400000) : null,
        };
      } else {
        range = getDateRange(datePreset);
      }

      // Sana oralig'ini serverga ham beramiz (yuklanadigan hajmni kamaytiradi).
      // Mahalliy Date'larni to'liq ISO instant sifatida yuboramiz — server naive
      // sanani UTC deb qabul qilgani uchun aks holda 5 soatlik siljish bo'lardi.
      // (Yakuniy filtr baribir quyidagi client-side inRange — bu faqat optimizatsiya.)
      const params: Record<string, string> = { ordering: "-submitted_at" };
      if (range.from) params.from = range.from.toISOString();
      if (range.to) params.to = range.to.toISOString();

      const all = await fetchAllSurveys(params);
      const inRange = all.filter((s) => {
        if (!range.from && !range.to) return true;
        const d = new Date(s.submitted_at || s.created_at);
        if (range.from && d < range.from) return false;
        if (range.to && d >= range.to) return false;
        return true;
      });
      const exportSurveys = dedupeLatestByStudent(inRange);

      if (exportSurveys.length === 0) {
        toast.error("Eksport qilish uchun ma'lumot topilmadi");
        return;
      }

      const XLSX = await import("xlsx");
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
      const fileName = `sorovnomalar_${presetLabels[datePreset]}_${toLocalDateString(new Date())}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`${exportSurveys.length} ta yozuv eksport qilindi`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? `Eksport qilishda xatolik: ${err.message}`
          : "Eksport qilishda xatolik yuz berdi",
      );
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
      <section className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
        <div className="px-4 py-3.5">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {stats ? stats.unique_students.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Unikal talabalar
          </p>
        </div>
        <div className="border-l border-border px-4 py-3.5">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-success">
            {stats ? stats.employed.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Ishlamoqda
          </p>
        </div>
        <div className="border-l border-border px-4 py-3.5">
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {stats ? stats.unemployed.toLocaleString() : "…"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Ishlamaydi
          </p>
        </div>
      </section>

      {statsError && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>Statistikani yuklab bo&apos;lmadi: {statsError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 font-mono text-[10px] uppercase tracking-wider"
            onClick={fetchStats}
          >
            Qayta urinish
          </Button>
        </div>
      )}

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
              disabled={exporting}
              size="sm"
              className="h-9 w-full sm:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Yuklanmoqda..." : "Eksport"}
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

              {/* Hujjat holati */}
              <Select
                value={filters.doc_status || "_all"}
                onValueChange={(v) =>
                  handleFilterChange("doc_status", v === "_all" ? "" : v)
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Hujjat holati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Hujjat (hammasi)</SelectItem>
                  <SelectItem value="verified">Tasdiqlangan</SelectItem>
                  <SelectItem value="pending">Ko&apos;rib chiqilmoqda</SelectItem>
                  <SelectItem value="rejected">Rad etildi</SelectItem>
                  <SelectItem value="no_docs">Hujjat yo&apos;q</SelectItem>
                </SelectContent>
              </Select>

              {/* Sana: dan */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 w-36 justify-start text-left text-xs font-normal",
                      !filters.from && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {filters.from ? filters.from : "Dan (sana)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.from ? new Date(filters.from) : undefined}
                    onSelect={(d) =>
                      handleFilterChange("from", d ? toLocalDateString(d) : "")
                    }
                    initialFocus
                  />
                  {filters.from && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => handleFilterChange("from", "")}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Tozalash
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Sana: gacha */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 w-36 justify-start text-left text-xs font-normal",
                      !filters.to && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {filters.to ? filters.to : "Gacha (sana)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.to ? new Date(filters.to) : undefined}
                    onSelect={(d) =>
                      handleFilterChange("to", d ? toLocalDateString(d) : "")
                    }
                    initialFocus
                  />
                  {filters.to && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => handleFilterChange("to", "")}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Tozalash
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><TableLoading rows={8} cols={7} /></div>
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
                      <EmptyStateRow
                        colSpan={7}
                        icon={Inbox}
                        title="Ma'lumot topilmadi"
                      />
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
                              {courseYearLabel(survey.course_year)}
                            </TableCell>
                            <TableCell>
                              <EmploymentBadge status={survey.employment_status} />
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
