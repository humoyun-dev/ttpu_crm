"use client";

import { useMemo, useState } from "react";
import { leadApi, Bot2Student, Lead } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudentPicker } from "./student-picker";

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

export function LeadAddStudentsDialog({ lead, open, onOpenChange, onAdded }: Props) {
  const [selected, setSelected] = useState<Record<string, Bot2Student>>({});
  const [saving, setSaving] = useState(false);

  // Leadda allaqachon bor talabalar — tanlagichda ko'rsatilmaydi.
  const excludeIds = useMemo(
    () => new Set((lead.lead_students ?? []).map(ls => ls.student)),
    [lead.lead_students],
  );

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggle = (s: Bot2Student) =>
    setSelected(prev => {
      const next = { ...prev };
      if (next[s.id]) delete next[s.id];
      else next[s.id] = s;
      return next;
    });

  const close = (o: boolean) => {
    if (!o) setSelected({});
    onOpenChange(o);
  };

  const handleAdd = async () => {
    const ids = selectedList.map(s => s.id);
    if (ids.length === 0) {
      toast.error("Talaba tanlanmadi");
      return;
    }
    setSaving(true);
    try {
      const res = await leadApi.addStudents(lead.id, ids);
      if (res.error) {
        const m = res.error.message;
        toast.error((Array.isArray(m) ? m.join("; ") : m) || "Xatolik yuz berdi");
        return;
      }
      toast.success(`${ids.length} ta talaba qo'shildi`);
      setSelected({});
      onOpenChange(false);
      onAdded();
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
          <DialogTitle>Talaba qo&apos;shish</DialogTitle>
          <DialogDescription>
            {lead.title} — yangi talabalarni tanlang. Har biriga follow-up boshlanadi.
          </DialogDescription>
        </DialogHeader>

        <StudentPicker
          selected={selected}
          onToggle={toggle}
          onClearAll={() => setSelected({})}
          excludeIds={excludeIds}
          requirement={lead.title}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Bekor</Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Qo&apos;shish{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
