"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { leadApi, Lead, LeadStatus, LEAD_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Search, Briefcase, RefreshCw, ExternalLink, Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { TableRowsSkeleton } from "@/components/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";
import { LeadCreateDialog } from "./lead-create-dialog";

const STATUS_BADGE: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
  created: "outline",
  sent: "secondary",
  viewing: "secondary",
  selected: "default",
  closed: "destructive",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function LeadsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    (async () => {
      setLoading(true);
      setError(null);
      const res = await leadApi.list(params);
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
        setLeads(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, reloadKey]);

  const handleSend = async (id: string) => {
    if (sending) return;
    setSending(id);
    try {
      const res = await leadApi.send(id);
      if (res.error || !res.data) {
        const m = res.error?.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Yuborishda xatolik");
        return;
      }
      const url = `${window.location.origin}/l/${res.data.token}`;
      setSentLink(url);
      toast.success("Havola yaratildi");
      reload();
    } catch {
      toast.error("Yuborishda xatolik");
    } finally {
      setSending(null);
    }
  };

  const copySentLink = async () => {
    if (!sentLink) return;
    await navigator.clipboard.writeText(sentLink);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Leadlar"
        title="Leadlar"
        description="Ish takliflari va ularning talabalarga yuborilish holati."
        actions={
          <>
            <span className="mr-1 hidden font-mono text-xs uppercase tracking-wide text-muted-foreground sm:inline">
              {totalCount.toLocaleString()} ta lead
            </span>
            <Button variant="outline" size="icon" onClick={reload} disabled={loading} aria-label="Yangilash" title="Yangilash">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {isAdmin && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Yangi lead
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Lead yoki kompaniya bo'yicha qidirish..."
              value={searchTerm}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
            />
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
                    <TableHead>Sarlavha</TableHead>
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead className="text-center">Talabalar</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRowsSkeleton rows={6} cols={6} />
                  ) : leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-30" />
                        {debouncedSearch ? "Natija topilmadi" : "Hali lead yo'q"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    leads.map(l => (
                      <TableRow
                        key={l.id}
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => router.push(`/dashboard/leads/${l.id}`)}
                      >
                        <TableCell className="font-medium">{l.title}</TableCell>
                        <TableCell className="text-muted-foreground">{l.employer_name}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[l.status]}>
                            {LEAD_STATUS_LABELS[l.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono tabular-nums text-muted-foreground">
                          {l.lead_students?.length ?? 0}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString("uz-UZ")}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild aria-label="Batafsil" title="Batafsil">
                              <Link href={`/dashboard/leads/${l.id}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            {isAdmin && l.status === "created" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSend(l.id)}
                                disabled={sending === l.id}
                              >
                                {sending === l.id ? "Yuborilmoqda..." : "Yuborish"}
                              </Button>
                            )}
                          </div>
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

      <LeadCreateDialog open={showCreate} onOpenChange={setShowCreate} onCreated={reload} />

      {/* "Yuborish"dan keyin: korxona havolasi */}
      <Dialog open={!!sentLink} onOpenChange={o => !o && setSentLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Ish beruvchi havolasi tayyor
            </DialogTitle>
            <DialogDescription>
              Bu havolani korxonaga yuboring (Telegram, email...). Havola egasi login qilmasdan lead&apos;dagi talabalarni ko&apos;radi. Havolani istalgan vaqt bekor qilish mumkin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              {sentLink}
            </code>
            <Button variant="outline" size="icon" onClick={copySentLink}>
              {copied ? <Check className="h-4 w-4 text-accent-gold" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {/* DIQQAT: havolani xodim ochsa GET /l/<token> lead statusini SENT→VIEWING
              ga o'tkazadi va korxona "ko'rdi" deb yozib qo'yadi (pipeline va follow-up'ni
              buzadi). Shuning uchun ochish tugmasi yo'q — faqat nusxa olib ulashiladi. */}
          <DialogFooter>
            <Button onClick={() => setSentLink(null)}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
