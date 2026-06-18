"use client";

import { useEffect, useState } from "react";
import { employerApi, Employer, MouStatus, MOU_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Search, Building2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MOU_BADGE: Record<MouStatus, "default" | "secondary" | "destructive"> = {
  negotiating: "secondary",
  signed: "default",
  expired: "destructive",
};

export default function EmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", industry: "", contact_email: "", contact_phone: "", mou_status: "negotiating" as MouStatus,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await employerApi.list();
      setEmployers(res.data?.results ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = employers.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.industry_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Nomi kiritilmadi"); return; }
    setSaving(true);
    try {
      const res = await employerApi.create(form);
      if (res.error) throw new Error(res.error.message as string);
      toast.success("Ish beruvchi qo'shildi");
      setShowCreate(false);
      setForm({ name: "", industry: "", contact_email: "", contact_phone: "", mou_status: "negotiating" });
      load();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ish beruvchilar</h1>
          <p className="text-sm text-muted-foreground">{employers.length} ta kompaniya</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Qo'shish
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nom yoki soha bo'yicha qidirish..."
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
                <TableHead>Kompaniya</TableHead>
                <TableHead>Soha</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>MOU holati</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    {search ? "Natija topilmadi" : "Hali ish beruvchi yo'q"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.industry_name || "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {e.contact_email && <div>{e.contact_email}</div>}
                        {e.contact_phone && <div className="text-muted-foreground">{e.contact_phone}</div>}
                        {!e.contact_email && !e.contact_phone && "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={MOU_BADGE[e.mou_status]}>
                        {MOU_STATUS_LABELS[e.mou_status]}
                      </Badge>
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
            <DialogTitle>Yangi ish beruvchi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nomi *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kompaniya nomi" />
            </div>
            <div>
              <Label>Soha</Label>
              <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="IT, Moliya, ..." />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="info@company.com" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+998..." />
            </div>
            <div>
              <Label>MOU holati</Label>
              <Select value={form.mou_status} onValueChange={v => setForm(f => ({ ...f, mou_status: v as MouStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(MOU_STATUS_LABELS) as [MouStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Bekor</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saqlanmoqda..." : "Saqlash"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
