"use client";

import { useCallback, useEffect, useState } from "react";
import {
  internshipApi,
  InternshipRequest,
  InternshipStatus,
  INTERNSHIP_STATUS_LABELS,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, GraduationCap, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { TableRowsSkeleton } from "@/components/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";

const STATUS_BADGE: Record<InternshipStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function InternshipsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<InternshipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | InternshipStatus>("all");
  const [approveTarget, setApproveTarget] = useState<InternshipRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<InternshipRequest | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let ignore = false;
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      ordering: "-created_at",
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter !== "all") params.status = statusFilter;

    (async () => {
      setLoading(true);
      setError(null);
      const [res, pendingRes] = await Promise.all([
        internshipApi.list(params),
        // Navbatdagi arizalar soni — sarlavha uchun (faqat count kerak).
        internshipApi.list({ status: "pending", page_size: "1" }),
      ]);
      if (ignore) return;
      if (res.error) {
        // Ro'yxat qisqargach DRF 404 "Invalid page" qaytaradi — tupik o'rniga
        // amaldagi sahifaga tushamiz.
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
        setItems(res.data.results);
        setTotalCount(res.data.count);
      }
      if (pendingRes.data) setPendingCount(pendingRes.data.count);
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, statusFilter, reloadKey]);

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setActing(approveTarget.id);
    try {
      const res = await internshipApi.review(approveTarget.id, "approved");
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success("Ariza tasdiqlandi — talabaga xabar yuborildi");
      setApproveTarget(null);
      reload();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setActing(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      const res = await internshipApi.review(rejectTarget.id, "rejected", rejectComment.trim());
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success("Ariza rad etildi — talabaga xabar yuborildi");
      setRejectTarget(null);
      setRejectComment("");
      reload();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Amaliyot"
        title="Amaliyot arizalari"
        description="Talabalarning amaliyot arizalarini ko'rib chiqing: tasdiqlang yoki rad eting. Natija talabaga botda yetkaziladi."
        actions={
          <>
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground tabular-nums">
              {pendingCount} ta navbatda
            </span>
            <Button variant="outline" size="icon" onClick={reload} disabled={loading} aria-label="Yangilash" title="Yangilash">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 min-w-48">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Talaba yoki kompaniya..."
                value={searchTerm}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v as "all" | InternshipStatus); setPage(1); }}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Holat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {(Object.entries(INTERNSHIP_STATUS_LABELS) as [InternshipStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={reload} /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Talaba</TableHead>
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Izoh</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRowsSkeleton rows={6} cols={6} />
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        <GraduationCap className="mx-auto mb-2 h-8 w-8 opacity-30" />
                        {debouncedSearch || statusFilter !== "all" ? "Natija topilmadi" : "Hali ariza yo'q"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.student_name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{r.student_external_id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.company_name}</div>
                          <Badge variant="outline" className="mt-0.5 text-[10px]">
                            {r.employer ? "Reestrdan" : "Erkin matn"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[16rem] text-sm text-muted-foreground">
                          <span className="line-clamp-2">{r.note || "—"}</span>
                          {r.status === "rejected" && r.staff_comment && (
                            <div className="mt-1 text-xs text-destructive line-clamp-2">
                              Sabab: {r.staff_comment}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[r.status]}>{INTERNSHIP_STATUS_LABELS[r.status]}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("uz-UZ")}
                        </TableCell>
                        <TableCell>
                          {isAdmin && r.status === "pending" && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success hover:text-success/80"
                                onClick={() => setApproveTarget(r)}
                                disabled={acting === r.id}
                                aria-label="Tasdiqlash"
                                title="Tasdiqlash"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive/80"
                                onClick={() => { setRejectTarget(r); setRejectComment(""); }}
                                disabled={acting === r.id}
                                aria-label="Rad etish"
                                title="Rad etish"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

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

      {/* Tasdiqlash — bitta bosishda Telegram xabari ketadi, shuning uchun tasdiq so'raladi */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arizani tasdiqlash</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget?.student_name} — {approveTarget?.company_name}. Tasdiqlangach talabaga botda xabar yuboriladi. Davom etasizmi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApprove}
              disabled={acting === approveTarget?.id}
            >
              Tasdiqlash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arizani rad etish</DialogTitle>
            <DialogDescription>
              {rejectTarget?.student_name} — {rejectTarget?.company_name}. Sabab talabaga xabarda ko'rsatiladi (ixtiyoriy).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Rad etish sababi (ixtiyoriy)..."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Bekor qilish</Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={acting === rejectTarget?.id}
            >
              Rad etish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
