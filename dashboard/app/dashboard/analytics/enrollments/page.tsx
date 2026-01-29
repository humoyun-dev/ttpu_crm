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
import { BarChart3, TrendingUp } from "lucide-react";

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

const fallbackOverview: Overview = {
  total_students: 820,
  total_responded: 410,
  coverage_percent: 50,
  by_year: [
    { course_year: 1, total: 220, responded: 110, coverage_percent: 50 },
    { course_year: 2, total: 210, responded: 120, coverage_percent: 57.1 },
    { course_year: 3, total: 200, responded: 90, coverage_percent: 45 },
    { course_year: 4, total: 190, responded: 90, coverage_percent: 47.4 },
  ],
  by_program: [
    {
      program_id: "mock-1",
      program_name: "Software Engineering",
      course_year: 1,
      total: 120,
      responded: 70,
      coverage_percent: 58.3,
    },
    {
      program_id: "mock-2",
      program_name: "Data Science",
      course_year: 2,
      total: 110,
      responded: 60,
      coverage_percent: 54.5,
    },
    {
      program_id: "mock-3",
      program_name: "Cyber Security",
      course_year: 3,
      total: 95,
      responded: 40,
      coverage_percent: 42.1,
    },
    {
      program_id: "mock-4",
      program_name: "Computer Networks",
      course_year: 4,
      total: 88,
      responded: 35,
      coverage_percent: 39.8,
    },
  ],
};

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
          setData(fallbackOverview);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Ma'lumotni yuklab bo'lmadi, mock ma'lumotlar ko'rsatilmoqda.");
        setData(fallbackOverview);
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

  const overview = data || fallbackOverview;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Talabalar soni analitikasi
          </h2>
          <p className="text-muted-foreground">
            Umumiy talabalar va ishtirok qamrovi
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Jami talabalar</CardTitle>
            <CardDescription>Kiritilgan umumiy son</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {overview.total_students.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ishtirok etganlar</CardTitle>
            <CardDescription>So&apos;rovnomani to&apos;ldirganlar</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <div className="text-3xl font-semibold text-primary">
              {overview.total_responded.toLocaleString()}
            </div>
            <Badge variant="outline">{totalCoverageText}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Qamrov</CardTitle>
            <CardDescription>Umumiy ulashuv foizi</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div className="text-3xl font-semibold">{totalCoverageText}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kurslar bo&apos;yicha</CardTitle>
          <CardDescription>Har bir kurs uchun qamrov</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                      {row.course_year}-kurs
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {row.total.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        {row.responded.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={row.coverage_percent >= 50 ? "default" : "outline"}
                      >
                        {row.coverage_percent.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yo&apos;nalish va kurslar kesimida</CardTitle>
          <CardDescription>Program/course bo&apos;yicha qamrov</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                      <TableCell className="text-center">
                        <Badge variant="outline">{row.course_year}-kurs</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {row.total.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {row.responded.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            row.coverage_percent >= 50 ? "default" : "outline"
                          }
                        >
                          {row.coverage_percent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
