"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { formatCourseYearLabel } from "@/lib/utils";
import { bot2Api, StudentRoster } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { Plus, Pencil, Trash2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
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

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function RosterTab() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [rosters, setRosters] = useState<StudentRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [missingBirthOnly, setMissingBirthOnly] = useState(false);
  const [missingCount, setMissingCount] = useState<number | null>(null);

  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let ignore = false;
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      ordering: "student_external_id",
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (missingBirthOnly) params.missing_birth_date = "true";

    (async () => {
      setLoading(true);
      setError(null);
      const res = await bot2Api.listRoster(params);
      if (ignore) return;
      if (res.error) {
        // Ro'yxat qisqargach DRF 404 "Invalid page" — amaldagi sahifaga tushamiz.
        if (res.error.status === 404 && page > 1) {
          setPage((p) => Math.max(1, p - 1));
          return;
        }
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        setLoading(false);
        return;
      }
      if (res.data) {
        setRosters(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, missingBirthOnly, reloadKey]);

  // Tug'ilgan sanasi yo'q talabalar SONI (filtrdan mustaqil ravishda ko'rsatiladi).
  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await bot2Api.listRoster({ missing_birth_date: "true", page_size: "1" });
      if (!ignore && res.data) setMissingCount(res.data.count);
    })();
    return () => { ignore = true; };
  }, [reloadKey]);

  const confirmDelete = async () => {
    if (!deletingId) return;
    const res = await bot2Api.deleteRoster(deletingId);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="ID bo'yicha qidirish..."
            value={searchTerm}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Tug'ilgan sanasiz talabalar — botda verifikatsiya qila olmaydi.
              Tugma ularni qizil ajratadi va faqat shularni ko'rsatishga o'tkazadi. */}
          {missingCount != null && missingCount > 0 && (
            <Button
              variant={missingBirthOnly ? "destructive" : "outline"}
              size="sm"
              onClick={() => { setMissingBirthOnly((v) => !v); setPage(1); }}
              className={missingBirthOnly ? "" : "border-destructive/40 text-destructive hover:text-destructive"}
              title="Tug'ilgan sanasi yo'q talabalar (botda verifikatsiya qila olmaydi)"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Sanasiz: <span className="ml-1 tabular-nums">{missingCount.toLocaleString()}</span>
            </Button>
          )}
          <span className="hidden font-mono text-xs uppercase tracking-wide text-muted-foreground sm:inline">
            Jami <span className="tabular-nums text-foreground">{totalCount.toLocaleString()}</span>
          </span>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Yangilash
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => router.push("/dashboard/students/new/edit")}>
              <Plus className="mr-2 h-4 w-4" />
              Qo&apos;shish
            </Button>
          )}
        </div>
      </div>

      {/* Tug'ilgan sanasiz talabalar — botda ro'yxatdan o'ta olmaydi. Aniq banner. */}
      {missingCount != null && missingCount > 0 && !missingBirthOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-foreground">
              <span className="font-semibold tabular-nums">{missingCount.toLocaleString()}</span>{" "}
              talabaning tug&apos;ilgan sanasi yo&apos;q — ular Telegram botda ro&apos;yxatdan
              o&apos;ta olmaydi. Iltimos, ularni tahrirlab to&apos;ldiring.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => { setMissingBirthOnly(true); setPage(1); }}
          >
            Faqat shularni ko&apos;rish
          </Button>
        </div>
      )}

      {/* Filtr yoqilgan — ogohlantiruvchi holat + tozalash tugmasi. */}
      {missingBirthOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-foreground">
              Faqat tug&apos;ilgan sanasi <span className="font-semibold">yo&apos;q</span> talabalar
              ko&apos;rsatilmoqda.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0"
            onClick={() => { setMissingBirthOnly(false); setPage(1); }}>
            Barchasini ko&apos;rsatish
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
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
                      <TableHead className="pl-4">Student ID</TableHead>
                      <TableHead>Ism Familya</TableHead>
                      <TableHead>Yo&apos;nalish</TableHead>
                      <TableHead className="text-center">Kurs</TableHead>
                      <TableHead className="text-center">Tug&apos;ilgan sana</TableHead>
                      <TableHead className="text-center">Holat</TableHead>
                      {isAdmin && <TableHead className="w-16" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rosters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 7 : 6} className="py-16 text-center text-sm text-muted-foreground">
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      rosters.map((roster) => (
                        <TableRow key={roster.id}
                          className={`group cursor-pointer hover:bg-muted/50 ${!roster.birth_date ? "bg-destructive/5" : ""}`}
                          onClick={() => router.push(`/dashboard/students/${roster.id}`)}>
                          <TableCell className="pl-4 font-mono text-sm font-medium tabular-nums">
                            {roster.student_external_id}
                          </TableCell>
                          <TableCell className="text-sm">
                            {roster.first_name || roster.last_name
                              ? `${roster.first_name} ${roster.last_name}`.trim()
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm">
                            {roster.program_details?.name_uz ||
                              roster.program_details?.name ||
                              roster.program ||
                              <span className="text-muted-foreground text-xs">Belgilanmagan</span>}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs tabular-nums text-muted-foreground">
                            {formatCourseYearLabel(roster.course_year)}
                          </TableCell>
                          <TableCell className="text-center">
                            {roster.birth_date ? (
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {roster.birth_date.split("-").reverse().join(".")}
                              </span>
                            ) : (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <AlertTriangle className="h-3 w-3" />
                                Yo&apos;q
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={roster.is_active ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {roster.is_active ? "Aktiv" : "Noaktiv"}
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Tahrirlash"
                                  title="Tahrirlash"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/students/${roster.id}/edit`); }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="O'chirish"
                                  title="O'chirish"
                                  onClick={(e) => { e.stopPropagation(); setDeletingId(roster.id); }}
                                >
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

              {totalCount > pageSize && (
                <PaginationBar
                  page={page}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O&apos;chirishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              Rostdan ham bu talabani o&apos;chirmoqchimisiz?
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
