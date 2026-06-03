"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { formatCourseYearLabel } from "@/lib/utils";
import { bot2Api, StudentRoster } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { Plus, Pencil, Trash2, Users, Search, RefreshCw } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function StudentsPage() {
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

    (async () => {
      setLoading(true);
      setError(null);
      const res = await bot2Api.listRoster(params);
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
        setRosters(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, reloadKey]);

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Talabalar</h1>
          <p className="text-sm text-muted-foreground">
            Jami {totalCount} ta talaba ro&apos;yxatga olingan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Yangilash
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => router.push("/dashboard/students/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Qo&apos;shish
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Talabalar ro&apos;yxati
              </CardTitle>
              <CardDescription className="text-xs">
                Barcha ro&apos;yxatga olingan talabalar
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="ID bo'yicha qidirish..."
                value={searchTerm}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-4 text-xs">Student ID</TableHead>
                      <TableHead className="text-xs">Yo&apos;nalish</TableHead>
                      <TableHead className="text-center text-xs">Kurs</TableHead>
                      <TableHead className="text-center text-xs">Kampaniya</TableHead>
                      <TableHead className="text-center text-xs">Holat</TableHead>
                      {isAdmin && <TableHead className="w-16 text-xs" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rosters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                          Ma&apos;lumot topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      rosters.map((roster) => (
                        <TableRow key={roster.id}>
                          <TableCell className="pl-4 font-mono text-sm font-medium">
                            {roster.student_external_id}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {roster.program_details?.name_uz ||
                              roster.program_details?.name ||
                              roster.program}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {formatCourseYearLabel(roster.course_year)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-xs">
                              {roster.roster_campaign}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={roster.is_active ? "default" : "destructive"}
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
                                  onClick={() => router.push(`/dashboard/students/${roster.id}`)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setDeletingId(roster.id)}
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
