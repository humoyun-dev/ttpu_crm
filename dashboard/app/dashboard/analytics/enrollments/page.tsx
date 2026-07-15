"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { analyticsApi } from "@/lib/api";
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
import { formatCourseYearLabel } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { Skeleton, TableRowsSkeleton } from "@/components/skeleton";
import { EmptyStateRow } from "@/components/empty-state";
import { Inbox } from "lucide-react";

interface Overview {
  total_students: number;
  total_responded: number;
  coverage_percent: number;
  by_year: Array<{
    course_year: number;
    total: number;
    responded: number;
    coverage_percent: number;
  }>;
  by_program: Array<{
    program_id: string;
    program_name: string;
    course_year: number;
    total: number;
    responded: number;
    coverage_percent: number;
  }>;
}

export default function EnrollmentAnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getEnrollmentOverview();
      if (res.error) {
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        return;
      }
      if (res.data) {
        setData(res.data);
      } else {
        setError("Ma'lumot topilmadi.");
      }
    } catch (err) {
      console.error(err);
      setError("Ma'lumotni yuklab bo'lmadi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalCoverageText = useMemo(() => {
    if (!data) return "0%";
    return `${data.coverage_percent.toFixed(1)}%`;
  }, [data]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analitika / Ro'yxat"
        title="Ro'yxat tahlili"
        description="Umumiy talabalar soni va so'rovnoma ishtirok qamrovi."
      />

      {error ? (
        <ErrorDisplay message={error} onRetry={load} />
      ) : (
        <>
          {/* Reestr-uslubidagi yakuniy ko'rsatkichlar */}
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
            <div className="px-5 py-4">
              {loading || !data ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {data.total_students.toLocaleString()}
                </p>
              )}
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Jami talabalar
              </p>
            </div>
            <div className="border-l border-border px-5 py-4">
              {loading || !data ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {data.total_responded.toLocaleString()}
                </p>
              )}
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Ishtirok etdi
              </p>
            </div>
            <div className="border-l border-border px-5 py-4">
              {loading || !data ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-mono text-2xl font-semibold tabular-nums text-accent-gold">
                  {totalCoverageText}
                </p>
              )}
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Qamrov
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Kurslar bo&apos;yicha</CardTitle>
              <CardDescription>Har bir kurs uchun qamrov</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kurs</TableHead>
                    <TableHead className="text-center">Jami</TableHead>
                    <TableHead className="text-center">Ishtirok etdi</TableHead>
                    <TableHead className="text-center">Qamrov</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading || !data ? (
                    <TableRowsSkeleton rows={4} cols={4} />
                  ) : data.by_year.length === 0 ? (
                    <EmptyStateRow
                      colSpan={4}
                      icon={Inbox}
                      title="Ma'lumot topilmadi"
                    />
                  ) : (
                    data.by_year.map((row) => (
                      <TableRow key={row.course_year}>
                        <TableCell className="font-medium">
                          {formatCourseYearLabel(row.course_year)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm tabular-nums">
                          {row.total.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm tabular-nums text-muted-foreground">
                          {row.responded.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              row.coverage_percent >= 50 ? "default" : "outline"
                            }
                            className="font-mono tabular-nums"
                          >
                            {row.coverage_percent.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yo&apos;nalish va kurslar kesimida</CardTitle>
              <CardDescription>Program/course bo&apos;yicha qamrov</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Yo&apos;nalish</TableHead>
                    <TableHead className="text-center">Kurs</TableHead>
                    <TableHead className="text-center">Jami</TableHead>
                    <TableHead className="text-center">Ishtirok etdi</TableHead>
                    <TableHead className="text-center">Qamrov</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading || !data ? (
                    <TableRowsSkeleton rows={5} cols={5} />
                  ) : data.by_program.length === 0 ? (
                    <EmptyStateRow
                      colSpan={5}
                      icon={Inbox}
                      title="Ma'lumot topilmadi"
                    />
                  ) : (
                    data.by_program.map((row) => (
                      <TableRow key={`${row.program_id}-${row.course_year}`}>
                        <TableCell className="font-medium">
                          {row.program_name}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm tabular-nums text-muted-foreground">
                          {formatCourseYearLabel(row.course_year)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm tabular-nums">
                          {row.total.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm tabular-nums text-muted-foreground">
                          {row.responded.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              row.coverage_percent >= 50 ? "default" : "outline"
                            }
                            className="font-mono tabular-nums"
                          >
                            {row.coverage_percent.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
