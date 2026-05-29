"use client";

import { useCallback, useEffect, useState } from "react";
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
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { formatCourseYearLabel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { analyticsApi, bot2Api, ProgramEnrollment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 50;

export default function EnrollmentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<ProgramEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Aggregate stats over the full dataset (not just current page)
  const [stats, setStats] = useState<{
    totalStudents: number;
    totalResponded: number;
    coverage: number;
  }>({ totalStudents: 0, totalResponded: 0, coverage: 0 });

  const { searchTerm, debouncedSearch, setSearch } = useSearch();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Whole-dataset totals via analytics aggregation endpoint
  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await analyticsApi.getEnrollmentOverview();
      if (ignore || !res.data) return;
      setStats({
        totalStudents: res.data.total_students,
        totalResponded: res.data.total_responded,
        coverage: res.data.coverage_percent,
      });
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let ignore = false;
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(PAGE_SIZE),
      ordering: "-created_at",
    };
    if (debouncedSearch) params.search = debouncedSearch;

    (async () => {
      setLoading(true);
      setError(null);
      const res = await bot2Api.listEnrollments(params);
      if (ignore) return;
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
        setItems(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [page, debouncedSearch, reloadKey]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    const res = await bot2Api.deleteEnrollment(deletingId);
    setDeletingId(null);
    if (res.error) {
      toast.error(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      return;
    }
    reload();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Talabalar soni</h2>
          <p className="text-muted-foreground">
            {totalCount} ta yozuv, jami {stats.totalStudents} ta talaba,{" "}
            {stats.totalResponded} ta ishtirokchi ({stats.coverage.toFixed(1)}%
            qamrov)
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => router.push("/dashboard/enrollments/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Yangi yozuv
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Program/Kurs bo&apos;yicha
            </CardTitle>
            <CardDescription>
              Har bir kurs va yo&apos;nalish bo&apos;yicha umumiy talabalar soni
            </CardDescription>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Qidirish..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableLoading />
          ) : error ? (
            <ErrorDisplay message={error} onRetry={reload} />
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Yo&apos;nalish</TableHead>
                      <TableHead className="text-center">Kurs</TableHead>
                      <TableHead className="text-center">Talabalar</TableHead>
                      <TableHead className="text-center">
                        Ishtirok etdi
                      </TableHead>
                      <TableHead className="text-center">Qamrov</TableHead>
                      <TableHead className="text-center">O&apos;quv yili</TableHead>
                      <TableHead className="text-center">Kampaniya</TableHead>
                      <TableHead className="text-center">Holat</TableHead>
                      <TableHead className="text-right">Amallar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((it) => (
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
                              {isAdmin ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        `/dashboard/enrollments/${it.id}`,
                                      )
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingId(it.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalCount > 0 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, totalCount)} / {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Oldingi
                    </Button>
                    <span className="text-sm">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Keyingi
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O&apos;chirishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              Rostdan ham bu yozuvni o&apos;chirmoqchimisiz? Bu amalni qaytarib
              bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
