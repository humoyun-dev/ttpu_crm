"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  vacancyApi, VacancyWrite, VacancyEmploymentType, VacancyWorkFormat,
  VACANCY_TYPE_LABELS, VACANCY_FORMAT_LABELS,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const RichTextEditor = dynamic(
  () => import("@/components/rich-text-editor").then(m => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[140px] rounded-md border border-border bg-muted/30 animate-pulse" /> }
);

const EMP_TYPES = Object.entries(VACANCY_TYPE_LABELS) as [VacancyEmploymentType, string][];
const WORK_FORMATS = Object.entries(VACANCY_FORMAT_LABELS) as [VacancyWorkFormat, string][];

const EMPTY: VacancyWrite = {
  title: "", company_name: "", description: "", requirements: "",
  employment_type: "full_time", work_format: "", schedule: "", experience: "",
  tags: "", address: "", salary_min: null, salary_max: null,
  salary_currency: "UZS", apply_url: "", apply_contact: "", deadline: null,
};

export default function NewVacancyPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState("");
  const [form, setForm] = useState<VacancyWrite>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const set = (k: keyof VacancyWrite, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleAiDraft = async () => {
    if (!brief.trim()) { toast.error("Brief kiritilmadi"); return; }
    setGenerating(true);
    try {
      const res = await vacancyApi.aiDraft(brief.trim());
      if (res.error || !res.data) throw new Error(String(res.error?.message ?? "AI xatosi"));
      set("description", res.data.description_html);
      set("requirements", res.data.requirements_html);
      if (!form.tags?.trim()) set("tags", res.data.tags);
      toast.success("AI matn tayyorladi");
    } catch {
      toast.error("AI matn tayyorlay olmadi");
    } finally {
      setGenerating(false);
    }
  };

  const onImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Sarlavha kiritilmadi"); return; }
    if (!form.company_name.trim()) { toast.error("Kompaniya nomi kiritilmadi"); return; }
    if (!form.description.trim()) { toast.error("Vazifalar kiritilmadi"); return; }
    setSaving(true);
    try {
      const res = await vacancyApi.create(form);
      if (res.error) throw new Error(String(res.error.message));
      const id = res.data!.id;
      if (imageFile) {
        const imgRes = await vacancyApi.uploadImage(id, imageFile);
        if (imgRes.error) toast.warning("Vakansiya yaratildi, lekin rasm yuklanmadi");
      }
      toast.success("Vakansiya yaratildi");
      router.push("/dashboard/vacancies");
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        eyebrow="Vakansiyalar"
        title="Yangi vakansiya"
        description="Yangi ish o'rni yarating. Keyin 'E'lon qilish' bilan kanalga joylaysiz."
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-1 h-4 w-4" />Orqaga
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* AI bilan to'ldirish */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              AI bilan to&apos;ldirish
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai_brief">Qisqa brief</Label>
              <Textarea
                id="ai_brief"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="backend dasturchi, 2 yil tajriba, Python/Django"
                rows={2}
                disabled={generating}
              />
            </div>
            <Button type="button" variant="outline" onClick={handleAiDraft} disabled={generating}>
              {generating
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Sparkles className="mr-1.5 h-4 w-4" />}
              AI bilan yozish
            </Button>
          </CardContent>
        </Card>

        {/* Asosiy */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Asosiy ma&apos;lumot
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Lavozim nomi *</Label>
                <Input id="title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Backend Developer" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_name">Kompaniya *</Label>
                <Input id="company_name" value={form.company_name} onChange={e => set("company_name", e.target.value)} placeholder="Acme MCHJ" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="employment_type">Bandlik turi</Label>
                <Select value={form.employment_type} onValueChange={v => set("employment_type", v as VacancyEmploymentType)}>
                  <SelectTrigger id="employment_type"><SelectValue /></SelectTrigger>
                  <SelectContent>{EMP_TYPES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="work_format">Ish joyi</Label>
                <Select value={form.work_format || undefined} onValueChange={v => set("work_format", v as VacancyWorkFormat)}>
                  <SelectTrigger id="work_format"><SelectValue placeholder="Tanlanmagan" /></SelectTrigger>
                  <SelectContent>
                    {WORK_FORMATS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="experience">Tajriba</Label>
                <Input id="experience" value={form.experience ?? ""} onChange={e => set("experience", e.target.value)} placeholder="3-5 yil" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="schedule">Jadval</Label>
                <Input id="schedule" value={form.schedule ?? ""} onChange={e => set("schedule", e.target.value)} placeholder="5/2, 9:00-18:00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Teglar</Label>
                <Input id="tags" value={form.tags ?? ""} onChange={e => set("tags", e.target.value)} placeholder="#python #backend" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vazifalar *</Label>
              <RichTextEditor value={form.description} onChange={v => set("description", v)} placeholder="Vazifalar va mas'uliyatlarni kiriting..." minHeight="140px" />
            </div>
            <div className="space-y-1.5">
              <Label>Talablar</Label>
              <RichTextEditor value={form.requirements ?? ""} onChange={v => set("requirements", v)} placeholder="Tajriba, ko'nikmalar, sertifikatlar..." minHeight="100px" />
            </div>
          </CardContent>
        </Card>

        {/* Maosh va aloqa */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Maosh va aloqa
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="salary_min">Maosh (min)</Label>
                <Input id="salary_min" type="number" value={form.salary_min ?? ""} onChange={e => set("salary_min", e.target.value ? Number(e.target.value) : null)} placeholder="3 000 000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary_max">Maosh (max)</Label>
                <Input id="salary_max" type="number" value={form.salary_max ?? ""} onChange={e => set("salary_max", e.target.value ? Number(e.target.value) : null)} placeholder="7 000 000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary_currency">Valyuta</Label>
                <Select value={form.salary_currency ?? "UZS"} onValueChange={v => set("salary_currency", v)}>
                  <SelectTrigger id="salary_currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UZS">UZS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Manzil</Label>
              <Input id="address" value={form.address ?? ""} onChange={e => set("address", e.target.value)} placeholder="Toshkent, Ko'cha 4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply_url">Ariza URL</Label>
              <Input id="apply_url" value={form.apply_url ?? ""} onChange={e => set("apply_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply_contact">Aloqa (tel/@username)</Label>
              <Input id="apply_contact" value={form.apply_contact ?? ""} onChange={e => set("apply_contact", e.target.value)} placeholder="+998901234567 yoki @username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline">Muddat</Label>
              <Input id="deadline" type="date" value={form.deadline ?? ""} onChange={e => set("deadline", e.target.value || null)} />
            </div>
          </CardContent>
        </Card>

        {/* Rasm */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Rasm (ixtiyoriy)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageChange} />
            {imagePreview ? (
              <div className="relative w-fit">
                <img src={imagePreview} alt="preview" className="h-40 w-auto rounded-md border border-border object-cover" />
                <button type="button" onClick={removeImage} aria-label="Rasmni o'chirish" title="Rasmni o'chirish" className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                Rasm yuklash
              </button>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Bekor</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Saqlash (Qoralama)
          </Button>
        </div>
      </form>
    </div>
  );
}
