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
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/loading";

function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export default function EnrollmentFormPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
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
    academic_year: currentAcademicYear(),
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
        a.name.localeCompare(b.name),
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
      toast.error(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      router.push("/dashboard/students?tab=enrollments");
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
      toast.error("Majburiy maydonlarni to'ldiring");
      return;
    }

    setSaving(true);
    const payload = {
      program: form.program,
      course_year: Number(form.course_year),
      student_count: Number(form.student_count),
      academic_year: String(form.academic_year || currentAcademicYear()),
      campaign: String(form.campaign || "default"),
      is_active: Boolean(form.is_active),
      notes: String(form.notes || ""),
    };

    const res = isNew
      ? await bot2Api.createEnrollment(payload)
      : await bot2Api.updateEnrollment(id, payload);

    if (res.error) {
      toast.error(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      setSaving(false);
      return;
    }

    router.push("/dashboard/students?tab=enrollments");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Talabalar / Ro'yxatga olish"
        title={isNew ? "Yangi ro'yxat" : "Ro'yxatni tahrirlash"}
        description="Yo'nalish va kurs bo'yicha umumiy talabalar sonini kiriting — analitika shu raqamlardan hisoblanadi."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/students?tab=enrollments")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Orqaga
          </Button>
        }
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
      {!isNew && (
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
          <div className="px-4 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {form.student_count ?? 0}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Jami talabalar
            </p>
          </div>
          <div className="border-l border-border px-4 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums text-accent-gold">
              {form.responded_count ?? 0}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Ishtirok etganlar
            </p>
          </div>
          <div className="border-l border-border px-4 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {(form.coverage_percent === undefined
                ? 0
                : form.coverage_percent
              ).toFixed(1)}
              %
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Qamrov
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ma&apos;lumot</CardTitle>
          <CardDescription>
            Yo&apos;nalish, kurs va talabalar sonini belgilang
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        programsLoading ? "Yuklanmoqda..." : "Tanlang"
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
                {!programsLoading &&
                  programs.length === 0 &&
                  !programsError && (
                    <p className="text-sm text-muted-foreground">
                      Yo&apos;nalishlar mavjud emas. Katalogga qo&apos;shib
                      ko&apos;ring.
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
                    <SelectItem value="5">Bitirgan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_count">Talabalar soni *</Label>
                <Input
                  id="student_count"
                  type="number"
                  min={0}
                  className="font-mono tabular-nums"
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
                  className="font-mono tabular-nums"
                  value={String(form.academic_year ?? currentAcademicYear())}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, academic_year: e.target.value }))
                  }
                  placeholder={currentAcademicYear()}
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
                onClick={() => router.push("/dashboard/students?tab=enrollments")}
              >
                Bekor qilish
              </Button>
              {isAdmin && (
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saqlanmoqda..." : "Saqlash"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
