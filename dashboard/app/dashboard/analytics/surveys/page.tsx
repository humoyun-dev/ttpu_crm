"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/error-display";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/loading";
import { TableRowsSkeleton } from "@/components/skeleton";
import { EmptyStateRow } from "@/components/empty-state";
import { analyticsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  TrendingUp,
  Users,
  UserCheck,
  Briefcase,
  UserX,
  ChevronDown,
  CalendarDays,
  Sparkles,
  Loader2,
  Lightbulb,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCourseYearLabel } from "@/lib/utils";

interface CourseYearData {
  course_year: number;
  total: number;
  responded: number;
  coverage_percent: number;
}

interface ProgramDetail {
  program_id: string;
  program_name: string;
  total: number;
  responded: number;
  coverage_percent: number;
  employed: number;
  unemployed: number;
}

interface SurveyInsights {
  summary: string;
  themes: { title: string; description: string }[];
  recommendations: string[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<CourseYearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [programDetails, setProgramDetails] = useState<ProgramDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // AI xulosa state
  const [insights, setInsights] = useState<SurveyInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsRequested, setInsightsRequested] = useState(false);

  // Filter state
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");

  // Load academic years on mount, then load coverage data
  useEffect(() => {
    analyticsApi
      .getAcademicYears()
      .then((response) => {
        if (response.data && response.data.length > 0) {
          setAcademicYears(response.data);
          setSelectedAcademicYear(response.data[0]); // latest
        } else {
          // No academic years found — load without filter
          loadCoverage();
        }
      })
      .catch(() => {
        // Endpoint unavailable — load without filter
        loadCoverage();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load coverage data
  const loadCoverage = useCallback((academicYear?: string) => {
    setLoading(true);
    setError(null);
    setSelectedYear(null);
    setProgramDetails([]);

    const opts = academicYear ? { academicYear } : undefined;
    analyticsApi
      .getCourseYearCoverage(opts)
      .then((response) => {
        if (response.error) {
          setError(
            Array.isArray(response.error.message)
              ? response.error.message.join(", ")
              : response.error.message,
          );
          return;
        }
        if (response.data) {
          setData(response.data);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Ma'lumotni yuklab bo'lmadi. Iltimos, qayta urinib ko'ring.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Reload when academic year changes
  useEffect(() => {
    if (selectedAcademicYear) {
      loadCoverage(selectedAcademicYear);
    }
  }, [selectedAcademicYear, loadCoverage]);

  const handleYearClick = async (year: number) => {
    if (selectedYear === year) {
      setSelectedYear(null);
      setProgramDetails([]);
      return;
    }

    setSelectedYear(year);
    setLoadingDetails(true);
    try {
      const opts = selectedAcademicYear
        ? { academicYear: selectedAcademicYear }
        : undefined;
      const response = await analyticsApi.getProgramDetailsByYear(year, opts);
      if (response.data) {
        setProgramDetails(response.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    setInsightsRequested(true);
    try {
      const response = await analyticsApi.surveyInsights();
      if (response.error || response.data?.error) {
        toast.error(
          response.data?.error ||
            (Array.isArray(response.error?.message)
              ? response.error?.message.join(", ")
              : response.error?.message) ||
            "AI tahlilni yuklab bo'lmadi.",
        );
        return;
      }
      if (response.data) {
        setInsights({
          summary: response.data.summary,
          themes: response.data.themes || [],
          recommendations: response.data.recommendations || [],
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("AI tahlilni yuklab bo'lmadi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setInsightsLoading(false);
    }
  };

  // Summary totals
  const totalStudents = data.reduce((sum, d) => sum + d.total, 0);
  const totalResponded = data.reduce((sum, d) => sum + d.responded, 0);
  const avgCoverage =
    data.length > 0
      ? data.reduce((sum, d) => sum + d.coverage_percent, 0) / data.length
      : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analitika / So'rovnoma"
        title="So'rovnoma tahlili"
        description="Talabalar tomonidan so'rovnomada ishtirok etish statistikasi — kurs va yo'nalishlar kesimida."
        actions={
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedAcademicYear}
              onValueChange={setSelectedAcademicYear}
            >
              <SelectTrigger className="w-40 font-mono text-xs tabular-nums">
                <SelectValue placeholder="O'quv yili" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year} o&apos;quv yili
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Reestr-uslubidagi yig'indi: hairline-ruled mono figures */}
      <section className="grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3">
        <div className="px-5 py-4 sm:border-r sm:border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
              Jami talabalar
            </p>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {totalStudents.toLocaleString()}
          </p>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0 sm:border-r sm:border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5" />
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
              Ishtirok etganlar
            </p>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {totalResponded.toLocaleString()}
          </p>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
              O&apos;rtacha qamrov
            </p>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-accent-gold">
            {avgCoverage.toFixed(1)}%
          </p>
        </div>
      </section>

      {/* Loading state */}
      {loading ? (
        <PageLoading />
      ) : error ? (
        <ErrorDisplay
          message={error}
          onRetry={() => loadCoverage(selectedAcademicYear || undefined)}
        />
      ) : (
        <>
          {/* Course year cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.map((yearData) => {
              const active = selectedYear === yearData.course_year;
              return (
                <Card
                  key={yearData.course_year}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden transition-colors",
                    active
                      ? "border-accent-gold bg-accent-gold/5"
                      : "hover:bg-muted/40 hover:border-accent-gold/50",
                  )}
                  onClick={() => handleYearClick(yearData.course_year)}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0 h-full w-0.5 bg-accent-gold transition-opacity",
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  />
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {formatCourseYearLabel(yearData.course_year)} talabalari
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center space-y-4 py-4">
                      <div className="relative w-32 h-32">
                        <svg
                          className="w-32 h-32 transform -rotate-90"
                          viewBox="0 0 128 128"
                        >
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="none"
                            className="text-muted/20"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 56}`}
                            strokeDashoffset={`${
                              2 *
                              Math.PI *
                              56 *
                              (1 - yearData.coverage_percent / 100)
                            }`}
                            className={cn(
                              "transition-all duration-1000",
                              yearData.coverage_percent >= 75
                                ? "text-success"
                                : yearData.coverage_percent >= 50
                                  ? "text-primary"
                                  : yearData.coverage_percent > 0
                                    ? "text-warning"
                                    : "text-muted/10",
                            )}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                            {yearData.coverage_percent.toFixed(1)}%
                          </div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            qamrov
                          </div>
                        </div>
                      </div>

                      <div className="w-full space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>Jami</span>
                          </div>
                          <span className="font-mono font-semibold tabular-nums">
                            {yearData.total}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <UserCheck className="h-4 w-4" />
                            <span>Ishtirok etdi</span>
                          </div>
                          <span className="font-mono font-semibold tabular-nums text-primary">
                            {yearData.responded}
                          </span>
                        </div>
                      </div>

                      {yearData.coverage_percent > 50 && (
                        <div className="flex items-center gap-1 text-xs text-success">
                          <TrendingUp className="h-3 w-3" />
                          <span>Yaxshi ko&apos;rsatkich</span>
                        </div>
                      )}

                      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Batafsil uchun bosing
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed table section */}
          {selectedYear !== null && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex justify-center">
                <ChevronDown className="h-6 w-6 text-accent-gold" />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="h-3.5 w-0.5 bg-accent-gold" />
                    {formatCourseYearLabel(selectedYear)} yo&apos;nalishlari
                    bo&apos;yicha statistika
                  </CardTitle>
                  <CardDescription>
                    Har bir yo&apos;nalish bo&apos;yicha talabalar soni va ish
                    bilan bandligi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Yo&apos;nalish</TableHead>
                          <TableHead className="text-center">Jami</TableHead>
                          <TableHead className="text-center">
                            Qatnashgan
                          </TableHead>
                          <TableHead className="text-center">Qamrov</TableHead>
                          <TableHead className="text-center">
                            Ishlaydi
                          </TableHead>
                          <TableHead className="text-center">
                            Ishlamaydi
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingDetails ? (
                          <TableRowsSkeleton rows={5} cols={6} />
                        ) : programDetails.length === 0 ? (
                          <EmptyStateRow
                            colSpan={6}
                            icon={Inbox}
                            title="Ma'lumot topilmadi"
                          />
                        ) : (
                          programDetails.map((program) => (
                            <TableRow key={program.program_id}>
                              <TableCell className="font-medium">
                                {program.program_name}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-mono tabular-nums">
                                  {program.total}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="font-mono tabular-nums">
                                  {program.responded}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={
                                    program.coverage_percent >= 50
                                      ? "default"
                                      : "destructive"
                                  }
                                  className="font-mono tabular-nums"
                                >
                                  {program.coverage_percent.toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Briefcase className="h-3 w-3 text-success" />
                                  <span className="font-mono font-semibold tabular-nums text-success">
                                    {program.employed}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <UserX className="h-3 w-3 text-warning" />
                                  <span className="font-mono tabular-nums text-warning">
                                    {program.unemployed}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* AI xulosa — talabalar takliflari bo'yicha Gemini tahlili */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Sun&apos;iy intellekt
            </p>
            <CardTitle className="flex items-center gap-2">
              <span className="h-3.5 w-0.5 bg-accent-gold" />
              AI xulosa
            </CardTitle>
            <CardDescription>
              Talabalarning so&apos;rovnomadagi erkin matnli takliflari bo&apos;yicha
              asosiy mavzular, umumiy xulosa va tavsiyalar.
            </CardDescription>
          </div>
          <Button
            onClick={handleGenerateInsights}
            disabled={insightsLoading}
            className="shrink-0"
          >
            {insightsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Tahlil qilinmoqda...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI tahlil qilish
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="font-mono text-[11px] uppercase tracking-wider">
                AI takliflarni tahlil qilmoqda...
              </p>
            </div>
          ) : !insights ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {insightsRequested
                ? "Tahlil natijasi mavjud emas."
                : "Talabalar takliflari asosida AI tahlilni boshlash uchun yuqoridagi tugmani bosing."}
            </p>
          ) : (
            <div className="space-y-8">
              {/* Umumiy xulosa */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Umumiy xulosa
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {insights.summary}
                </p>
              </div>

              {/* Asosiy mavzular */}
              {insights.themes.length > 0 && (
                <div className="space-y-3">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Asosiy mavzular
                  </p>
                  <ul className="space-y-3">
                    {insights.themes.map((theme, idx) => (
                      <li
                        key={idx}
                        className="rounded-lg border border-border bg-muted/30 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {theme.title}
                        </p>
                        {theme.description && (
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {theme.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tavsiyalar */}
              {insights.recommendations.length > 0 && (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5 text-accent-gold" />
                    Tavsiyalar
                  </p>
                  <ul className="space-y-2">
                    {insights.recommendations.map((rec, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-gold" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
