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
import { analyticsApi } from "@/lib/api";
import {
  TrendingUp,
  Users,
  UserCheck,
  Briefcase,
  UserX,
  ChevronDown,
  CalendarDays,
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

export default function AnalyticsPage() {
  const [data, setData] = useState<CourseYearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [programDetails, setProgramDetails] = useState<ProgramDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filter state
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");

  // Load academic years on mount
  useEffect(() => {
    analyticsApi
      .getAcademicYears()
      .then((response) => {
        if (response.data && response.data.length > 0) {
          setAcademicYears(response.data);
          setSelectedAcademicYear(response.data[0]); // latest
        }
      })
      .catch(console.error);
  }, []);

  // Load coverage data when academic year changes
  const loadData = useCallback(() => {
    if (!selectedAcademicYear) return;
    setLoading(true);
    setSelectedYear(null);
    setProgramDetails([]);

    const opts = { academicYear: selectedAcademicYear };
    analyticsApi
      .getCourseYearCoverage(opts)
      .then((response) => {
        if (response.data) {
          setData(response.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAcademicYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleYearClick = async (year: number) => {
    if (selectedYear === year) {
      setSelectedYear(null);
      setProgramDetails([]);
      return;
    }

    setSelectedYear(year);
    setLoadingDetails(true);
    try {
      const response = await analyticsApi.getProgramDetailsByYear(year, {
        academicYear: selectedAcademicYear,
      });
      if (response.data) {
        setProgramDetails(response.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetails(false);
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
    <div className="space-y-6 p-6">
      {/* Header with filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            So&apos;rovnoma Analitikasi
          </h2>
          <p className="text-muted-foreground">
            Talabalar tomonidan so&apos;rovnomada ishtirok etish statistikasi
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedAcademicYear}
              onValueChange={setSelectedAcademicYear}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="O'quv yili" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}-yil
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jami talabalar</p>
                <p className="text-2xl font-bold">{totalStudents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Ishtirok etganlar
                </p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {totalResponded}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  O&apos;rtacha qamrov
                </p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {avgCoverage.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Course year cards */}
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {data.map((yearData) => {
              return (
                <Card
                  key={yearData.course_year}
                  className={cn(
                    "relative overflow-hidden cursor-pointer transition-all duration-300",
                    selectedYear === yearData.course_year
                      ? "shadow-xl border-2 border-primary ring-2 ring-primary/20"
                      : "hover:shadow-lg hover:border-primary/50",
                  )}
                  onClick={() => handleYearClick(yearData.course_year)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
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
                                ? "text-green-500"
                                : yearData.coverage_percent >= 50
                                  ? "text-primary"
                                  : yearData.coverage_percent > 0
                                    ? "text-orange-500"
                                    : "text-muted/10",
                            )}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-2xl font-bold">
                            {yearData.coverage_percent.toFixed(1)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
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
                          <span className="font-semibold">
                            {yearData.total}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <UserCheck className="h-4 w-4" />
                            <span>Ishtirok etdi</span>
                          </div>
                          <span className="font-semibold text-primary">
                            {yearData.responded}
                          </span>
                        </div>
                      </div>

                      {yearData.coverage_percent > 50 && (
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <TrendingUp className="h-3 w-3" />
                          <span>Yaxshi ko&apos;rsatkich</span>
                        </div>
                      )}

                      <p className="text-xs text-center text-muted-foreground mt-2">
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
                <ChevronDown className="h-8 w-8 text-primary animate-bounce" />
              </div>

              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                    {formatCourseYearLabel(selectedYear)} yo&apos;nalishlari
                    bo&apos;yicha statistika
                  </CardTitle>
                  <CardDescription>
                    Har bir yo&apos;nalish bo&apos;yicha talabalar soni va ish
                    bilan bandligi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingDetails ? (
                    <div className="flex items-center justify-center h-48">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                  ) : (
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
                        {programDetails.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center py-8 text-muted-foreground"
                            >
                              Ma&apos;lumot topilmadi
                            </TableCell>
                          </TableRow>
                        ) : (
                          programDetails.map((program) => (
                            <TableRow key={program.program_id}>
                              <TableCell className="font-medium">
                                {program.program_name}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{program.total}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">
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
                                >
                                  {program.coverage_percent.toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Briefcase className="h-3 w-3 text-green-600" />
                                  <span className="text-green-600 font-semibold">
                                    {program.employed}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <UserX className="h-3 w-3 text-orange-600" />
                                  <span className="text-orange-600">
                                    {program.unemployed}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
