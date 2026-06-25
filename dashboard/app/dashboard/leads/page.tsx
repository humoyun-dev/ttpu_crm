"use client";

import { useEffect, useState } from "react";
import { leadApi, employerApi, Lead, Employer, LeadStatus, LEAD_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Search, Briefcase, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";

const STATUS_BADGE: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
  created: "outline",
  sent: "secondary",
  viewing: "secondary",
  selected: "default",
  closed: "destructive",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [form, setForm] = useState({ employer: "", title: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await leadApi.list();
      setLeads(res.data?.results ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    employerApi.list().then(res => setEmployers(res.data?.results ?? []));
  }, []);

  const filtered = leads.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.employer_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.employer || !form.title.trim()) { toast.error("Barcha majburiy maydonlarni to'ldiring"); return; }
    setSaving(true);
    try {
      const res = await leadApi.create({ employer: form.employer, title: form.title, notes: form.notes });
      if (res.error) throw new Error();
      toast.success("Lead yaratildi");
      setShowCreate(false);
      setForm({ employer: "", title: "", notes: "" });
      load();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await leadApi.send(id);
      if (res.error) throw new Error();
      toast.success("Havola yaratildi");
      load();
    } catch {
      toast.error("Yuborishda xatolik");
    }
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
              {leads.length} ta lead
            </span>
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Yangi lead
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Lead yoki kompaniya bo'yicha qidirish..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
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
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Yuklanmoqda...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    {search ? "Natija topilmadi" : "Hali lead yo'q"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(l => (
                  <TableRow key={l.id} className="transition-colors hover:bg-muted/40">
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
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/leads/${l.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {l.status === "created" && (
                          <Button variant="outline" size="sm" onClick={() => handleSend(l.id)}>
                            Yuborish
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yangi lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Kompaniya *</Label>
              <Select value={form.employer} onValueChange={v => setForm(f => ({ ...f, employer: v }))}>
                <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
                <SelectContent>
                  {employers.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sarlavha *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Masalan: Junior Python dasturchi" />
            </div>
            <div>
              <Label>Izoh</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Qo'shimcha ma'lumot" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Bekor</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saqlanmoqda..." : "Yaratish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
