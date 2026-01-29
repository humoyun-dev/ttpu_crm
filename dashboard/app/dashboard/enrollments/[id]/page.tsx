"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bot2Api, catalogApi, CatalogItem, ProgramEnrollment } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function EnrollmentFormPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<CatalogItem[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<ProgramEnrollment>>({
    program: "",
    course_year: 1,
    student_count: 0,
    academic_year: "2025-2026",
    campaign: "default",
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    loadPrograms();
    if (!isNew) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadPrograms = async () => {
    setProgramsLoading(true);
    setProgramsError(null);
    try {
      const [programRes, directionRes] = await Promise.all([
        catalogApi.list("program", { is_active: "true", page_size: "500" }),
        catalogApi.list("direction", { is_active: "true", page_size: "500" }),
      ]);

      const programItems =
        programRes.data?.results ||
        (Array.isArray(programRes.data) ? programRes.data : []);
      const directionItems =
        directionRes.data?.results ||
        (Array.isArray(directionRes.data) ? directionRes.data : []);

      const merged = [...programItems, ...directionItems].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setPrograms(merged);
    } catch (err) {
      console.error("Failed to load programs", err);
      setProgramsError("Yo'nalishlarni yuklab bo'lmadi");
    } finally {
      setProgramsLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const res = await bot2Api.getEnrollment(id);
    if (res.data) setForm(res.data);
    if (res.error) {
      alert(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message
      );
      router.push("/dashboard/enrollments");
    }
    setLoading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.program ||
      !form.course_year ||
      form.student_count === undefined
    ) {
      alert("Majburiy maydonlarni to'ldiring");
      return;
    }

    setSaving(true);
    const payload = {
      program: form.program,
      course_year: Number(form.course_year),
      student_count: Number(form.student_count),
      academic_year: String(form.academic_year || "2025-2026"),
      campaign: String(form.campaign || "default"),
      is_active: Boolean(form.is_active),
      notes: String(form.notes || ""),
    };

    const res = isNew
      ? await bot2Api.createEnrollment(payload)
      : await bot2Api.updateEnrollment(id, payload);

    if (res.error) {
      alert(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message
      );
      setSaving(false);
      return;
    }

    router.push("/dashboard/enrollments");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/enrollments")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Orqaga
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {isNew ? "Yangi talabalar soni" : "Tahrirlash"}
          </h2>
          <p className="text-muted-foreground">
            Program va kurs bo'yicha umumiy talabalar sonini kiriting
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ma&apos;lumot</CardTitle>
          <CardDescription>
            Analytics shu raqamlardan hisoblanadi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isNew && (
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Jami talabalar
                </p>
                <p className="text-2xl font-semibold">
                  {form.student_count ?? 0}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Ishtirok etganlar
                </p>
                <p className="text-2xl font-semibold text-primary">
                  {form.responded_count ?? 0}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Qamrov</p>
                <p className="text-2xl font-semibold">
                  {(
                    form.coverage_percent === undefined
                      ? 0
                      : form.coverage_percent
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="program">Yo&apos;nalish *</Label>
                <Select
                  value={(form.program as string) || ""}
                  onValueChange={(v) => setForm((s) => ({ ...s, program: v }))}
                  disabled={programsLoading}
                >
                  <SelectTrigger id="program">
                    <SelectValue
                      placeholder={
                        programsLoading
                          ? "Yuklanmoqda..."
                          : "Tanlang"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.type === "direction" ? " (yo'nalish)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {programsError && (
                  <p className="text-sm text-destructive">{programsError}</p>
                )}
                {!programsLoading && programs.length === 0 && !programsError && (
                  <p className="text-sm text-muted-foreground">
                    Yo&apos;nalishlar mavjud emas. Katalogga qo&apos;shib ko&apos;ring.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="course_year">Kurs *</Label>
                <Select
                  value={String(form.course_year ?? 1)}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, course_year: Number(v) }))
                  }
                >
                  <SelectTrigger id="course_year">
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1-kurs</SelectItem>
                    <SelectItem value="2">2-kurs</SelectItem>
                    <SelectItem value="3">3-kurs</SelectItem>
                    <SelectItem value="4">4-kurs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_count">Talabalar soni *</Label>
                <Input
                  id="student_count"
                  type="number"
                  min={0}
                  value={String(form.student_count ?? 0)}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      student_count: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="academic_year">O&apos;quv yili</Label>
                <Input
                  id="academic_year"
                  value={String(form.academic_year ?? "2025-2026")}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, academic_year: e.target.value }))
                  }
                  placeholder="2025-2026"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign">Kampaniya</Label>
                <Input
                  id="campaign"
                  value={String(form.campaign ?? "default")}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, campaign: e.target.value }))
                  }
                  placeholder="default"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_active">Holat</Label>
                <Select
                  value={form.is_active ? "true" : "false"}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, is_active: v === "true" }))
                  }
                >
                  <SelectTrigger id="is_active">
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aktiv</SelectItem>
                    <SelectItem value="false">Aktiv emas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Izoh</Label>
                <Textarea
                  id="notes"
                  value={String(form.notes ?? "")}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, notes: e.target.value }))
                  }
                  placeholder="(ixtiyoriy)"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/enrollments")}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
