"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  vacancyApi, Vacancy, VacancyStatus,
  VACANCY_STATUS_LABELS, VACANCY_TYPE_LABELS, formatDate,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Megaphone, RefreshCw, Pencil, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { TableRowsSkeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_BADGE: Record<VacancyStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  published: "border-transparent bg-success/15 text-success",
  closed: "border-transparent bg-warning/15 text-warning",
  archived: "border-transparent bg-destructive/10 text-destructive",
};

export default function VacanciesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vacancy | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await vacancyApi.list();
      if (res.error) {
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        return;
      }
      setVacancies(res.data ?? []);
    } catch {
      setError("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Vakansiyalar API'si to'liq admin-only: viewer'ga 403 keladi.
  const accessDenied = user != null && !isAdmin;

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return vacancies.filter(v =>
      v.title.toLowerCase().includes(searchLower) ||
      v.company_name.toLowerCase().includes(searchLower)
    );
  }, [vacancies, search]);

  const handlePublish = async (id: string) => {
    setPublishing(id);
    try {
      const res = await vacancyApi.publish(id);
      if (res.error) throw new Error(String(res.error.message));
      toast.success("Vakansiya e'lon qilindi");
      load();
    } catch {
      toast.error("E'lon qilishda xatolik");
    } finally {
      setPublishing(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await vacancyApi.delete(deleteTarget.id);
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "O'chirishda xatolik");
        return;
      }
      toast.success("Vakansiya o'chirildi");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("O'chirishda xatolik");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Vakansiyalar"
        title="Vakansiyalar"
        description={`Telegram kanalga e'lon qilinadigan ish o'rinlari — ${vacancies.length} ta.`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Yangilash" title="Yangilash">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {isAdmin && (
              <Button onClick={() => router.push("/dashboard/vacancies/new")}>
                <Plus className="mr-1.5 h-4 w-4" />Yangi vakansiya
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="px-0 pb-0">
          {accessDenied ? (
            <div className="p-6">
              <ErrorDisplay message="Bu bo'lim faqat administratorlar uchun. Sizning rolingiz ruxsat bermaydi." />
            </div>
          ) : error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={load} /></div>
          ) : (
            <>
              <div className="p-4 border-b">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sarlavha yoki kompaniya..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Sarlavha</TableHead>
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Turi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Yaratilgan</TableHead>
                    <TableHead className="pr-5 w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRowsSkeleton rows={6} cols={7} />
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                        <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        {search ? "Hech narsa topilmadi" : "Hozircha vakansiya yo'q"}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="pl-5 font-medium max-w-[200px]">
                        <span className="truncate block">{v.title}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px]">
                        <span className="truncate block">{v.company_name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {VACANCY_TYPE_LABELS[v.employment_type] || v.employment_type}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[v.status] || ""}>
                          {VACANCY_STATUS_LABELS[v.status] || v.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {v.channel_status === "synced" && (
                          <Badge className="border-transparent bg-success/15 text-success text-[11px]">
                            Sinxron
                          </Badge>
                        )}
                        {v.channel_status === "pending" && (
                          <Badge className="border-transparent bg-warning/15 text-warning text-[11px]">
                            Yuborilmoqda
                          </Badge>
                        )}
                        {v.channel_status === "failed" && (
                          <Badge className="border-transparent bg-destructive/10 text-destructive text-[11px]">
                            Xatolik
                          </Badge>
                        )}
                        {v.channel_status === "not_posted" && (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(v.created_at)}
                      </TableCell>
                      <TableCell className="pr-5">
                        {isAdmin && (
                          <div className="flex items-center gap-1 justify-end">
                            {v.status === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={publishing === v.id}
                                onClick={() => handlePublish(v.id)}
                              >
                                <Send className="h-3 w-3" />E'lon
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label="Tahrirlash"
                              title="Tahrirlash"
                              onClick={() => router.push(`/dashboard/vacancies/${v.id}/edit`)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label="O'chirish"
                              title="O'chirish"
                              onClick={() => setDeleteTarget(v)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vakansiyani o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.title}» vakansiyasini o'chirmoqchimisiz?
              Agar e'lon qilingan bo'lsa, kanaldan ham o'chiriladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "O'chirilmoqda…" : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
