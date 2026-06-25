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
import { Plus, Pencil, Trash2, Users, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar } from "@/components/ui/pagination-bar";
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
import { PageHeader } from "@/components/page-header";

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talabalar / Ro'yxatga olish"
        title="Ro'yxatga olish"
        description="Dasturlar va kurslar bo'yicha talabalar soni hamda so'rovnoma qamrovi."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Yangilash
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => router.push("/dashboard/enrollments/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Qo&apos;shish
              </Button>
            )}
          </>
        }
      />

      {/* Reestr-uslubidagi umumiy statistika */}
      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
        <div className="px-4 py-3 text-center">
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {stats.totalStudents.toLocaleString()}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Talabalar
          </p>
        </div>
        <div className="border-l border-border px-4 py-3 text-center">
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {stats.totalResponded.toLocaleString()}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Ishtirok
          </p>
        </div>
        <div className="border-l border-border px-4 py-3 text-center">
          <p className="font-mono text-2xl font-semibold tabular-nums text-accent-gold">
            {stats.coverage.toFixed(1)}%
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Qamrov
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Dastur / Kurs bo&apos;yicha
              </CardTitle>
              <CardDescription className="text-xs">
                Jami <span className="font-mono tabular-nums">{totalCount}</span> ta yozuv
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Qidirish..."
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><TableLoading /></div>
          ) : error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={reload} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Yo&apos;nalish</TableHead>
                      <TableHead className="text-center">Kurs</TableHead>
                      <TableHead className="text-center">Talabalar</TableHead>
                      <TableHead className="text-center">Ishtirok</TableHead>
                      <TableHead className="text-center">Qamrov</TableHead>
                      <TableHead className="text-center">O&apos;quv yili</TableHead>
                      <TableHead className="text-center">Holat</TableHead>
                      {isAdmin && <TableHead className="w-16" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((it) => (
                        <TableRow key={it.id} className="hover:bg-muted/40">
                          <TableCell className="pl-4 text-sm font-medium">
                            {it.program_details?.name_uz || it.program_details?.name || it.program}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">{formatCourseYearLabel(it.course_year)}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-sm">{it.student_count}</TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-sm">{it.responded_count ?? 0}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={(it.coverage_percent ?? 0) >= 50 ? "default" : "outline"}
                              className="font-mono tabular-nums text-xs"
                            >
                              {(it.coverage_percent ?? 0).toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-xs text-muted-foreground">{it.academic_year}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={it.is_active ? "default" : "destructive"} className="text-xs">
                              {it.is_active ? "Aktiv" : "Noaktiv"}
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => router.push(`/dashboard/enrollments/${it.id}`)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setDeletingId(it.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalCount > PAGE_SIZE && (
                <PaginationBar
                  page={page}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
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
