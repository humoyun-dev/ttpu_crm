"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    analyticsApi
      .getEnrollmentOverview()
      .then((res) => {
        if (res.data) {
          setData(res.data);
        } else {
          setError("Ma'lumot topilmadi.");
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Ma'lumotni yuklab bo'lmadi. Iltimos, qayta urinib ko'ring.");
      })
      .finally(() => setLoading(false));
  }, []);

  const totalCoverageText = useMemo(() => {
    if (!data) return "0%";
    return `${data.coverage_percent.toFixed(1)}%`;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{error || "Ma'lumot topilmadi."}</p>
      </div>
    );
  }

  const overview = data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analitika / Ro'yxat"
        title="Ro'yxat tahlili"
        description="Umumiy talabalar soni va so'rovnoma ishtirok qamrovi."
      />

      {/* Reestr-uslubidagi yakuniy ko'rsatkichlar */}
      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
        <div className="px-5 py-4">
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {overview.total_students.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Jami talabalar
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {overview.total_responded.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Ishtirok etdi
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          <p className="font-mono text-2xl font-semibold tabular-nums text-accent-gold">
            {totalCoverageText}
          </p>
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
              {overview.by_year.map((row) => (
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
              ))}
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
              {overview.by_program.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Ma&apos;lumot topilmadi
                  </TableCell>
                </TableRow>
              ) : (
                overview.by_program.map((row) => (
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
    </div>
  );
}
