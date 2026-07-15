"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import {
  vacancyApi, Vacancy, VacancyWrite, VacancyEmploymentType, VacancyWorkFormat,
  VACANCY_TYPE_LABELS, VACANCY_STATUS_LABELS, VACANCY_FORMAT_LABELS, formatDate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, ImagePlus, Loader2, Send, X, Megaphone } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";

const RichTextEditor = dynamic(
  () => import("@/components/rich-text-editor").then(m => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[140px] rounded-md border border-border bg-muted/30 animate-pulse" /> }
);

const EMP_TYPES = Object.entries(VACANCY_TYPE_LABELS) as [VacancyEmploymentType, string][];
const WORK_FORMATS = Object.entries(VACANCY_FORMAT_LABELS) as [VacancyWorkFormat, string][];

const STATUS_BADGE: Record<string, string> = {
  draft:     "border-transparent bg-muted text-muted-foreground",
  published: "border-transparent bg-success/15 text-success",
  closed:    "border-transparent bg-warning/15 text-warning",
  archived:  "border-transparent bg-destructive/10 text-destructive",
};

function vacancyToForm(v: Vacancy): VacancyWrite {
  return {
    title: v.title, company_name: v.company_name,
    description: v.description, requirements: v.requirements,
    employment_type: v.employment_type,
    work_format: v.work_format ?? "",
    schedule: v.schedule ?? "", experience: v.experience ?? "",
    tags: v.tags ?? "", address: v.address ?? "",
    salary_min: v.salary_min, salary_max: v.salary_max,
    salary_currency: v.salary_currency,
    apply_url: v.apply_url, apply_contact: v.apply_contact,
    deadline: v.deadline,
  };
}

export default function EditVacancyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState<VacancyWrite | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    vacancyApi.get(id).then(res => {
      if (res.error) {
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        return;
      }
      if (res.data) {
        setVacancy(res.data);
        setForm(vacancyToForm(res.data));
        if (res.data.image_url) setImagePreview(res.data.image_url);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof VacancyWrite, v: unknown) => setForm(f => f ? { ...f, [k]: v } : f);

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
    if (!form) return;
    setSaving(true);
    try {
      const res = await vacancyApi.update(id, form);
      if (res.error) throw new Error(String(res.error.message));
      if (imageFile) {
        const imgRes = await vacancyApi.uploadImage(id, imageFile);
        if (imgRes.error) toast.warning("Saqlandi, lekin rasm yuklanmadi");
        else setImageFile(null);
      }
      toast.success("Saqlandi");
      router.push("/dashboard/vacancies");
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await vacancyApi.publish(id);
      if (res.error) throw new Error(String(res.error.message));
      toast.success("E'lon qilindi");
      router.push("/dashboard/vacancies");
    } catch {
      toast.error("E'lon qilishda xatolik");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <ErrorDisplay message={error} onRetry={load} />
      </div>
    );
  }
  if (!vacancy || !form) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Vakansiya topilmadi"
        description="Bu vakansiya o'chirilgan yoki mavjud emas."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/vacancies">
              <ArrowLeft className="mr-1.5 h-4 w-4" />Vakansiyalar ro&apos;yxatiga qaytish
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        eyebrow="Vakansiyalar"
        title={vacancy.title}
        description={`${vacancy.company_name} · Yaratilgan: ${formatDate(vacancy.created_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge className={STATUS_BADGE[vacancy.status] || ""}>
              {VACANCY_STATUS_LABELS[vacancy.status as keyof typeof VACANCY_STATUS_LABELS] || vacancy.status}
            </Badge>
            {vacancy.status === "draft" && (
              <Button size="sm" disabled={publishing} onClick={handlePublish}>
                {publishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                E&apos;lon qilish
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-1 h-4 w-4" />Orqaga
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
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
                <Input id="title" value={form.title} onChange={e => set("title", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_name">Kompaniya *</Label>
                <Input id="company_name" value={form.company_name} onChange={e => set("company_name", e.target.value)} />
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
                <Input id="salary_min" type="number" value={form.salary_min ?? ""} onChange={e => set("salary_min", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary_max">Maosh (max)</Label>
                <Input id="salary_max" type="number" value={form.salary_max ?? ""} onChange={e => set("salary_max", e.target.value ? Number(e.target.value) : null)} />
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
              <Input id="apply_contact" value={form.apply_contact ?? ""} onChange={e => set("apply_contact", e.target.value)} />
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
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs text-muted-foreground underline">
                  Almashtirib yuklash
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
            Saqlash
          </Button>
        </div>
      </form>
    </div>
  );
}
