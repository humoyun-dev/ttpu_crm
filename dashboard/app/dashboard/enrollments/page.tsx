"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCourseYearLabel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { bot2Api, ProgramEnrollment } from "@/lib/api";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

export default function EnrollmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProgramEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((it) => {
      const programName = it.program_details?.name ?? "";
      return (
        programName.toLowerCase().includes(query) ||
        it.academic_year.toLowerCase().includes(query) ||
        it.campaign.toLowerCase().includes(query) ||
        String(it.course_year).includes(query)
      );
    });
  }, [items, q]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await bot2Api.listEnrollments({
        page_size: "200",
        ordering: "-updated_at",
      });
      if (res.data) {
        setItems(res.data.results);
        setTotalCount(res.data.count);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Rostdan ham o'chirmoqchimisiz?")) return;
    const res = await bot2Api.deleteEnrollment(id);
    if (res.error) {
      alert(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const totalStudents = items.reduce(
    (sum, it) => sum + (it.student_count || 0),
    0,
  );
  const totalResponded = items.reduce(
    (sum, it) => sum + (it.responded_count || 0),
    0,
  );

  const overallCoverage =
    totalStudents === 0
      ? "0.0"
      : ((totalResponded / totalStudents) * 100).toFixed(1);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Talabalar soni</h2>
          <p className="text-muted-foreground">
            {totalCount} ta yozuv, jami {totalStudents} ta talaba,{" "}
            {totalResponded} ta ishtirokchi ({overallCoverage}% qamrov)
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/enrollments/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Yangi yozuv
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Program/Kurs bo'yicha
            </CardTitle>
            <CardDescription>
              Har bir kurs va yo'nalish bo'yicha umumiy talabalar soni
            </CardDescription>
          </div>
          <div className="w-full md:max-w-sm">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Qidirish..."
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Yo'nalish</TableHead>
                  <TableHead className="text-center">Kurs</TableHead>
                  <TableHead className="text-center">Talabalar</TableHead>
                  <TableHead className="text-center">Ishtirok etdi</TableHead>
                  <TableHead className="text-center">Qamrov</TableHead>
                  <TableHead className="text-center">O'quv yili</TableHead>
                  <TableHead className="text-center">Kampaniya</TableHead>
                  <TableHead className="text-center">Holat</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Ma'lumot topilmadi
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.program_details?.name ?? it.program}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {formatCourseYearLabel(it.course_year)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{it.student_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {it.responded_count ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            (it.coverage_percent ?? 0) >= 50
                              ? "default"
                              : "outline"
                          }
                        >
                          {(it.coverage_percent ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{it.academic_year}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{it.campaign}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {it.is_active ? (
                          <Badge variant="default">Aktiv</Badge>
                        ) : (
                          <Badge variant="destructive">Aktiv emas</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/enrollments/${it.id}`)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(it.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
