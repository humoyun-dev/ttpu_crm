"use client";

import { useEffect, useMemo, useState } from "react";
import { employerApi, leadApi, Bot2Student, Employer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudentPicker } from "./student-picker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function LeadCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [form, setForm] = useState({ employer: "", title: "", notes: "" });
  const [selected, setSelected] = useState<Record<string, Bot2Student>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    employerApi.list({ page_size: "100" }).then(r => {
      if (ignore) return;
      if (r.error) {
        const m = r.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Kompaniyalarni yuklashda xatolik");
        return;
      }
      setEmployers(r.data?.results ?? []);
    });
    return () => { ignore = true; };
  }, [open]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggle = (s: Bot2Student) =>
    setSelected(prev => {
      const next = { ...prev };
      if (next[s.id]) delete next[s.id];
      else next[s.id] = s;
      return next;
    });

  const resetAll = () => {
    setForm({ employer: "", title: "", notes: "" });
    setSelected({});
  };

  const close = (o: boolean) => {
    if (!o) resetAll();
    onOpenChange(o);
  };

  const handleCreate = async () => {
    if (!form.employer || !form.title.trim()) {
      toast.error("Kompaniya va sarlavha majburiy");
      return;
    }
    setSaving(true);
    try {
      const res = await leadApi.create({
        employer: form.employer,
        title: form.title,
        notes: form.notes,
        student_ids: selectedList.map(s => s.id),
      });
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success(`Lead yaratildi — ${selectedList.length} ta talaba`);
      resetAll();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Yangi lead</DialogTitle>
          <DialogDescription>
            Kompaniya va sarlavhani kiriting, so&apos;ng talabalarni tanlang.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-employer">Kompaniya *</Label>
            <Select value={form.employer} onValueChange={v => setForm(f => ({ ...f, employer: v }))}>
              <SelectTrigger id="lead-employer" className="!h-11 w-full rounded-xl px-4">
                <SelectValue placeholder="Tanlang..." />
              </SelectTrigger>
              <SelectContent>
                {employers.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-title">Sarlavha *</Label>
            <Input id="lead-title" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Masalan: Junior Python dasturchi" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lead-notes">Izoh</Label>
            <Textarea id="lead-notes" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Qo'shimcha ma'lumot" />
          </div>
        </div>

        <StudentPicker selected={selected} onToggle={toggle} onClearAll={() => setSelected({})}
          requirement={`${form.title}${form.notes ? ". " + form.notes : ""}`} />

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Bekor</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Yaratish{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
