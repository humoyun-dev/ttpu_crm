"use client";

import { useCallback, useEffect, useState } from "react";
import { documentApi, Document, DocumentStatus, DocumentType, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, FileText, RefreshCw, CheckCircle, Flag } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";

const STATUS_BADGE: Record<DocumentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  verified: "default",
  flagged: "destructive",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function DocumentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentStatus>("all");
  const [reviewing, setReviewing] = useState<string | null>(null);

  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let ignore = false;
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (typeFilter !== "all") params.type = typeFilter;
    if (statusFilter !== "all") params.status = statusFilter;

    (async () => {
      setLoading(true);
      setError(null);
      const res = await documentApi.list(params);
      if (ignore) return;
      if (res.error) {
        // Ro'yxat qisqargach (masalan oxirgi sahifadagi yozuvni ko'rib chiqqach) DRF
        // 404 "Invalid page" qaytaradi — tupik ErrorDisplay o'rniga amaldagi sahifaga
        // tushamiz (kerak bo'lsa yana qisqaradi).
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
        setDocuments(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, typeFilter, statusFilter, reloadKey]);

  const handleReview = async (id: string, status: DocumentStatus) => {
    if (reviewing) return;
    setReviewing(id);
    try {
      const res = await documentApi.review(id, status);
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success(status === "verified" ? "Hujjat tasdiqlandi" : "Hujjat belgilandi");
      reload();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Hujjatlar"
        title="Hujjatlar"
        description="Talabalar yuklagan hujjatlarni ko'rib chiqing va tasdiqlang."
        actions={
          <>
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground tabular-nums">
              {totalCount.toLocaleString()} ta hujjat
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
                placeholder="Student ID..."
                value={searchTerm}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v as "all" | DocumentType); setPage(1); }}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Tur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {(Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as "all" | DocumentStatus); setPage(1); }}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue placeholder="Holat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {(Object.entries(DOCUMENT_STATUS_LABELS) as [DocumentStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><TableLoading /></div>
          ) : error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={reload} /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Tur</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Yuklangan</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                        {debouncedSearch || typeFilter !== "all" || statusFilter !== "all" ? "Natija topilmadi" : "Hali hujjat yo'q"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    documents.map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-sm">{d.student_external_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[d.status]}>
                            {DOCUMENT_STATUS_LABELS[d.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {new Date(d.created_at).toLocaleDateString("uz-UZ")}
                        </TableCell>
                        <TableCell>
                          {isAdmin && d.status === "pending" && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success hover:text-success/80"
                                onClick={() => handleReview(d.id, "verified")}
                                disabled={reviewing === d.id}
                                aria-label="Tasdiqlash"
                                title="Tasdiqlash"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-warning hover:text-warning/80"
                                onClick={() => handleReview(d.id, "flagged")}
                                disabled={reviewing === d.id}
                                aria-label="Belgilash"
                                title="Belgilash"
                              >
                                <Flag className="h-4 w-4" />
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
    </div>
  );
}
