"use client";

import { useCallback, useEffect, useState } from "react";
import { employerApi, Employer, MouStatus, MOU_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Search, Building2, RefreshCw, MoreHorizontal, Pencil, Trash2, Briefcase, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { TableRowsSkeleton } from "@/components/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/hooks/use-search";

const MOU_BADGE: Record<MouStatus, "default" | "secondary" | "destructive"> = {
  negotiating: "secondary",
  signed: "default",
  expired: "destructive",
};

const EMPTY_FORM = {
  name: "", industry: "", contact_email: "", contact_phone: "", mou_status: "negotiating" as MouStatus,
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function EmployersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employer | null>(null);

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
      const res = await employerApi.list(params);
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
        setEmployers(res.data.results);
        setTotalCount(res.data.count);
      }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, [page, pageSize, debouncedSearch, reloadKey]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (e: Employer) => {
    setEditingId(e.id);
    setForm({
      name: e.name ?? "",
      industry: e.industry ?? "",
      contact_email: e.contact_email ?? "",
      contact_phone: e.contact_phone ?? "",
      mou_status: e.mou_status,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Nomi kiritilmadi"); return; }
    setSaving(true);
    try {
      const res = editingId
        ? await employerApi.update(editingId, form)
        : await employerApi.create(form);
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success(editingId ? "O'zgartirildi" : "Ish beruvchi qo'shildi");
      setShowDialog(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      reload();
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await employerApi.delete(deleteTarget.id);
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "O'chirishda xatolik");
        return;
      }
      toast.success("O'chirildi");
      setDeleteTarget(null);
      reload();
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Ish beruvchilar"
        title="Ish beruvchilar"
        description={`Hamkor kompaniyalar reesti — ${totalCount.toLocaleString()} ta tashkilot.`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={reload} disabled={loading} aria-label="Yangilash" title="Yangilash">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {isAdmin && (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Qo&apos;shish
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nom yoki email bo'yicha qidirish..."
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
                    <TableHead>Kompaniya</TableHead>
                    <TableHead>Soha</TableHead>
                    <TableHead>Kontakt</TableHead>
                    <TableHead>MOU holati</TableHead>
                    {isAdmin && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRowsSkeleton rows={6} cols={isAdmin ? 5 : 4} />
                  ) : employers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                        {debouncedSearch ? "Natija topilmadi" : "Hali ish beruvchi yo'q"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    employers.map(e => (
                      <TableRow
                        key={e.id}
                        className={`group hover:bg-muted/40 ${isAdmin ? "cursor-pointer" : ""}`}
                        onClick={() => { if (isAdmin) openEdit(e); }}
                      >
                        <TableCell className="font-medium">
                          <span className="relative">
                            <span className="absolute -left-4 top-1/2 hidden h-4 w-0.5 -translate-y-1/2 bg-accent-gold group-hover:block" />
                            {e.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.industry_name || "—"}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {e.contact_email && <div className="font-mono text-xs">{e.contact_email}</div>}
                            {e.contact_phone && <div className="font-mono text-xs text-muted-foreground tabular-nums">{e.contact_phone}</div>}
                            {!e.contact_email && !e.contact_phone && <span className="text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={MOU_BADGE[e.mou_status]}>
                            {MOU_STATUS_LABELS[e.mou_status]}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell onClick={ev => ev.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Amallar" title="Amallar">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(e)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Tahrirlash
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(e)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> O&apos;chirish
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
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

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Ish beruvchini tahrirlash" : "Yangi ish beruvchi"}</DialogTitle>
            <DialogDescription>Hamkor kompaniya ma&apos;lumotlari.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-1">
            {/* Asosiy */}
            <section className="space-y-3">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Asosiy
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="emp-name">Nomi *</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="emp-name" className="pl-10" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kompaniya nomi" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-industry">Soha</Label>
                <div className="relative">
                  <Briefcase className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="emp-industry" className="pl-10" value={form.industry}
                    onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="IT, Moliya, ..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-mou">MOU holati</Label>
                <Select value={form.mou_status} onValueChange={v => setForm(f => ({ ...f, mou_status: v as MouStatus }))}>
                  <SelectTrigger id="emp-mou" className="!h-11 w-full rounded-xl px-4"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(MOU_STATUS_LABELS) as [MouStatus, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Kontakt */}
            <section className="space-y-3">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Kontakt
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emp-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="emp-email" type="email" className="pl-10" value={form.contact_email}
                      onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="info@company.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-phone">Telefon</Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="emp-phone" className="pl-10" value={form.contact_phone}
                      onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+998..." />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Bekor</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saqlanmoqda..." : "Saqlash"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ish beruvchini o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; o&apos;chiriladi. Bu amalni ortga qaytarib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
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
