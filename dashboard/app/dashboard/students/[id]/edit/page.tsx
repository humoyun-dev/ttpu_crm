"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { bot2Api, catalogApi, CatalogItem } from "@/lib/api";
import { toLocalDateString } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { ArrowLeft, Save, CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";

function displayToIso(val: string): string {
  const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function isoToDisplay(val: string): string {
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : val;
}

function DatePickerField({ value, onChange, disabled }: { value: string; onChange: (iso: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value ? isoToDisplay(value) : "");
  const [open, setOpen] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) { setPrevValue(value); setText(value ? isoToDisplay(value) : ""); }

  const handleTextChange = (raw: string) => {
    setText(raw);
    const iso = displayToIso(raw);
    if (iso) onChange(iso);
    else if (!raw) onChange("");
  };
  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    const iso = toLocalDateString(date);
    onChange(iso);
    setText(isoToDisplay(iso));
    setOpen(false);
  };
  const selectedDate = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input value={text} onChange={(e) => handleTextChange(e.target.value)}
            placeholder="KK.OO.YYYY" maxLength={10} disabled={disabled} className="pr-8" />
          {value && !disabled && (
            <button type="button" onClick={() => { onChange(""); setText(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setOpen((p) => !p)}>
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="rounded-lg border border-border bg-card shadow-sm w-fit">
          <Calendar mode="single" selected={selectedDate} onSelect={handleCalendarSelect}
            captionLayout="dropdown" fromYear={1970} toYear={new Date().getFullYear()}
            defaultMonth={selectedDate ?? new Date(2000, 0)} />
        </div>
      )}
    </div>
  );
}

const NO_REGION = "__none__";

export default function StudentEditPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const id = params?.id as string;
  const isNew = id === "new";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<CatalogItem[]>([]);
  const [regions, setRegions] = useState<CatalogItem[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null); // linked Bot2Student
  const [form, setForm] = useState({
    // Roster
    student_external_id: "",
    first_name: "",
    last_name: "",
    roster_campaign: "default",
    program: "",
    course_year: 1,
    is_active: true,
    birth_date: "",
    // Profil (Bot2Student)
    phone: "",
    gender: "unspecified",
    region: NO_REGION,
    language: "uz",
  });

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dirs, regs] = await Promise.all([
        catalogApi.list("direction"),
        catalogApi.list("region"),
      ]);
      if (dirs.data) setPrograms(dirs.data.results);
      if (regs.data) setRegions(regs.data.results);

      // Yangi talaba: roster hali yo'q — bo'sh forma bilan qolamiz.
      if (isNew) { setLoading(false); return; }

      const [rosterRes, studentsRes] = await Promise.all([
        bot2Api.getRoster(id),
        bot2Api.listStudents({ roster: id }),
      ]);

      const r = rosterRes.data;
      const s = studentsRes.data?.results?.[0] ?? null;
      setStudentId(s?.id ?? null);

      setForm({
        student_external_id: r?.student_external_id ?? "",
        first_name: r?.first_name || s?.first_name || "",
        last_name: r?.last_name || s?.last_name || "",
        roster_campaign: r?.roster_campaign ?? "default",
        program: r?.program ?? "",
        course_year: r?.course_year ?? 1,
        is_active: r?.is_active ?? true,
        birth_date: r?.birth_date ?? "",
        phone: s?.phone ?? "",
        gender: s?.gender ?? "unspecified",
        region: s?.region ?? NO_REGION,
        language: s?.language ?? "uz",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.student_external_id || !form.program) {
      toast.error("Talaba ID va yo'nalish majburiy"); return;
    }
    setSaving(true);
    try {
      const rosterPayload = {
        student_external_id: form.student_external_id,
        first_name: form.first_name,
        last_name: form.last_name,
        roster_campaign: form.roster_campaign,
        program: form.program,
        course_year: form.course_year,
        is_active: form.is_active,
        birth_date: form.birth_date || null,
      };

      // Yangi talaba: roster yaratamiz va uning sahifasiga o'tamiz.
      if (isNew) {
        const createRes = await bot2Api.createRoster(rosterPayload);
        if (createRes.error) throw new Error(Array.isArray(createRes.error.message) ? createRes.error.message.join(", ") : String(createRes.error.message));
        toast.success("Talaba qo'shildi");
        router.push(`/dashboard/students/${createRes.data?.id ?? ""}`);
        return;
      }

      // 1) Roster
      const rosterRes = await bot2Api.updateRoster(id, rosterPayload);
      if (rosterRes.error) throw new Error(Array.isArray(rosterRes.error.message) ? rosterRes.error.message.join(", ") : String(rosterRes.error.message));

      // 2) Bot profil (agar mavjud bo'lsa) — ism ham sinxronlanadi
      if (studentId) {
        const studentRes = await bot2Api.updateStudent(studentId, {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          gender: form.gender as "male" | "female" | "other" | "unspecified",
          region: form.region === NO_REGION ? null : form.region,
          language: form.language,
        });
        if (studentRes.error) toast.warning("Roster saqlandi, lekin profil yangilanmadi");
      }

      toast.success("Saqlandi");
      router.push(`/dashboard/students/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={loadAll} />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Talabalar"
        title={isNew ? "Yangi talaba" : "Talabani tahrirlash"}
        description={isNew ? "Reestrga yangi talaba qo'shing." : "Talaba ma'lumotlarini yangilang."}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(isNew ? "/dashboard/students" : `/dashboard/students/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />Orqaga
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Asosiy / Roster */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Asosiy ma&apos;lumotlar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student_external_id">Talaba ID <span className="text-destructive">*</span></Label>
                <Input id="student_external_id" value={form.student_external_id}
                  onChange={(e) => set({ student_external_id: e.target.value })}
                  required disabled={!isNew} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="program">Yo&apos;nalish <span className="text-destructive">*</span></Label>
                <Select value={form.program} onValueChange={(v) => set({ program: v })}>
                  <SelectTrigger id="program"><SelectValue placeholder="Yo'nalishni tanlang" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="first_name">Ism</Label>
                <Input id="first_name" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} placeholder="Ism" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Familiya</Label>
                <Input id="last_name" value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} placeholder="Familiya" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course_year">Kurs <span className="text-destructive">*</span></Label>
                <Select value={form.course_year.toString()} onValueChange={(v) => set({ course_year: parseInt(v) })}>
                  <SelectTrigger id="course_year"><SelectValue placeholder="Kursni tanlang" /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4].map(y => <SelectItem key={y} value={String(y)}>{y}-kurs</SelectItem>)}
                    <SelectItem value="5">Bitirgan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tug&apos;ilgan sana</Label>
                <DatePickerField value={form.birth_date} onChange={(v) => set({ birth_date: v })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roster_campaign">Kampaniya</Label>
                <Input id="roster_campaign" value={form.roster_campaign} onChange={(e) => set({ roster_campaign: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Holat</Label>
                <Select value={form.is_active ? "true" : "false"} onValueChange={(v) => set({ is_active: v === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aktiv</SelectItem>
                    <SelectItem value="false">Noaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profil (Bot) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profil ma&apos;lumotlari</CardTitle>
          </CardHeader>
          <CardContent>
            {studentId ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+998..." />
                </div>
                <div className="space-y-2">
                  <Label>Jins</Label>
                  <Select value={form.gender} onValueChange={(v) => set({ gender: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Erkak</SelectItem>
                      <SelectItem value="female">Ayol</SelectItem>
                      <SelectItem value="other">Boshqa</SelectItem>
                      <SelectItem value="unspecified">Belgilanmagan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hudud</Label>
                  <Select value={form.region} onValueChange={(v) => set({ region: v })}>
                    <SelectTrigger><SelectValue placeholder="Tanlanmagan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_REGION}>Tanlanmagan</SelectItem>
                      {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name_uz || r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Til</Label>
                  <Select value={form.language} onValueChange={(v) => set({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uz">O&apos;zbekcha</SelectItem>
                      <SelectItem value="ru">Ruscha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Talaba botda ro&apos;yxatdan o&apos;tmagan — profil ma&apos;lumotlari (telefon, jins, hudud) mavjud emas.
              </p>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.push(isNew ? "/dashboard/students" : `/dashboard/students/${id}`)}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saqlanmoqda…" : "Saqlash"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
