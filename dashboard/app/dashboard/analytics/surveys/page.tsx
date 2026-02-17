"use client";

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { analyticsApi } from "@/lib/api";
import {
  TrendingUp,
  Users,
  UserCheck,
  Briefcase,
  UserX,
  ChevronDown,
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

  useEffect(() => {
    analyticsApi
      .getCourseYearCoverage()
      .then((response) => {
        if (response.data) {
          setData(response.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleYearClick = async (year: number) => {
    // Toggle selection: if clicking the same year, deselect it
    if (selectedYear === year) {
      setSelectedYear(null);
      setProgramDetails([]);
      return;
    }

    setSelectedYear(year);
    setLoadingDetails(true);
    try {
      const response = await analyticsApi.getProgramDetailsByYear(year);
      if (response.data) {
        setProgramDetails(response.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetails(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          So&apos;rovnoma Analitikasi
        </h2>
        <p className="text-muted-foreground">
          Talabalar tomonidan so&apos;rovnomada ishtirok etish statistikasi
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {data.map((yearData) => (
          <Card
            key={yearData.course_year}
            className={cn(
              "relative overflow-hidden cursor-pointer transition-all duration-300",
              selectedYear === yearData.course_year
                ? "shadow-xl border-2 border-primary ring-2 ring-primary/20"
                : "hover:shadow-lg",
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
                <div className="relative w-40 h-40">
                  <svg className="w-40 h-40 transform -rotate-90">
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className="text-muted/20"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 70}`}
                      strokeDashoffset={`${
                        2 * Math.PI * 70 * (1 - yearData.coverage_percent / 100)
                      }`}
                      className="text-primary transition-all duration-1000"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-3xl font-bold">
                      {yearData.coverage_percent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">qamrov</div>
                  </div>
                </div>

                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Jami talabalar</span>
                    </div>
                    <span className="font-semibold">{yearData.total}</span>
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
                  Batafsil ma&apos;lumot uchun bosing
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Umumiy statistika</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Jami talabalar</p>
              <p className="text-2xl font-bold">
                {data.reduce((sum, d) => sum + d.total, 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                So&apos;rovnomada ishtirok etdi
              </p>
              <p className="text-2xl font-bold text-primary">
                {data.reduce((sum, d) => sum + d.responded, 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                O&apos;rtacha qamrov
              </p>
              <p className="text-2xl font-bold">
                {data.length > 0
                  ? (
                      data.reduce((sum, d) => sum + d.coverage_percent, 0) /
                      data.length
                    ).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed table section - appears below circles when year is selected */}
      {selectedYear !== null && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Visual connection indicator */}
          <div className="flex justify-center">
            <ChevronDown className="h-8 w-8 text-primary animate-bounce" />
          </div>

          {/* Table card */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                {formatCourseYearLabel(selectedYear)} yo&apos;nalishlari
                bo&apos;yicha statistika
              </CardTitle>
              <CardDescription>
                Har bir yo&apos;nalish bo&apos;yicha talabalar soni va ish bilan
                bandligi
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDetails ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Yo&apos;nalish</TableHead>
                      <TableHead className="text-center">Jami</TableHead>
                      <TableHead className="text-center">Qatnashgan</TableHead>
                      <TableHead className="text-center">Qamrov</TableHead>
                      <TableHead className="text-center">Ishlaydi</TableHead>
                      <TableHead className="text-center">Ishlamaydi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {programDetails.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
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
    </div>
  );
}
