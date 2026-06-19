"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { Calendar } from "@/components/ui/calendar";
import { bot2Api, catalogApi, CatalogItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Save, CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";

// DD.MM.YYYY → YYYY-MM-DD (store format)
function displayToIso(val: string): string {
  const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// YYYY-MM-DD → DD.MM.YYYY (display)
function isoToDisplay(val: string): string {
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : val;
}

function DatePickerField({
  value,
  onChange,
  disabled,
}: {
  value: string; // YYYY-MM-DD or ""
  onChange: (iso: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value ? isoToDisplay(value) : "");
  const [open, setOpen] = useState(false);

  // Keep text in sync when value changes externally (load)
  useEffect(() => {
    setText(value ? isoToDisplay(value) : "");
  }, [value]);

  const handleTextChange = (raw: string) => {
    setText(raw);
    // Accept as-you-type: DD.MM.YYYY
    const iso = displayToIso(raw);
    if (iso) onChange(iso);
    else if (!raw) onChange("");
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    onChange(iso);
    setText(isoToDisplay(iso));
    setOpen(false);
  };

  const selectedDate = value
    ? new Date(value + "T00:00:00")
    : undefined;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="KK.OO.YYYY"
            maxLength={10}
            disabled={disabled}
            className="pr-8"
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => { onChange(""); setText(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          aria-label="Kalendarni ochish"
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="rounded-xl border bg-card shadow-md w-fit">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            captionLayout="dropdown"
            fromYear={1970}
            toYear={new Date().getFullYear()}
            defaultMonth={selectedDate ?? new Date(2000, 0)}
          />
        </div>
      )}
    </div>
  );
}

export default function StudentFormPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const id = params?.id as string;
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<CatalogItem[]>([]);

  const [formData, setFormData] = useState({
    student_external_id: "",
    roster_campaign: "default",
    program: "",
    course_year: 1,
    is_active: true,
    birth_date: "",
  });

  useEffect(() => {
    loadPrograms();
    if (!isNew) {
      loadRoster();
    }
  }, [id]);

  const loadPrograms = async () => {
    try {
      const response = await catalogApi.list("program");
      if (response.data) {
        setPrograms(response.data.results);
      }
    } catch (error) {
      console.error("Error loading programs:", error);
    }
  };

  const loadRoster = async () => {
    setLoading(true);
    try {
      const response = await bot2Api.getRoster(id);
      if (response.data) {
        setFormData({
          student_external_id: response.data.student_external_id,
          roster_campaign: response.data.roster_campaign,
          program: response.data.program,
          course_year: response.data.course_year,
          is_active: response.data.is_active,
          birth_date: response.data.birth_date ?? "",
        });
      }
    } catch (error) {
      console.error("Error loading roster:", error);
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.student_external_id || !formData.program) {
      toast.error("Barcha majburiy maydonlarni to'ldiring");
      return;
    }

    setSaving(true);
    const payload = {
      ...formData,
      birth_date: formData.birth_date || null,
    };
    const res = isNew
      ? await bot2Api.createRoster(payload)
      : await bot2Api.updateRoster(id, payload);

    if (res.error) {
      toast.error(
        Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message,
      );
      setSaving(false);
      return;
    }

    router.push("/dashboard/students");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/students")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Orqaga
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {isNew ? "Yangi talaba" : "Talabani tahrirlash"}
          </h2>
          <p className="text-muted-foreground">
            {isNew
              ? "Yangi talaba ma'lumotlarini kiriting"
              : "Talaba ma'lumotlarini yangilang"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Talaba ma&apos;lumotlari</CardTitle>
          <CardDescription>
            Talabaning asosiy ma&apos;lumotlarini to&apos;ldiring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student_external_id">
                  Talaba ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="student_external_id"
                  value={formData.student_external_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      student_external_id: e.target.value,
                    })
                  }
                  placeholder="Masalan: S12345"
                  required
                  disabled={!isNew} // ID ni faqat yaratishda o'zgartirish mumkin
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="roster_campaign">Kampaniya</Label>
                <Input
                  id="roster_campaign"
                  value={formData.roster_campaign}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      roster_campaign: e.target.value,
                    })
                  }
                  placeholder="default"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="program">
                  Yo&apos;nalish <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.program}
                  onValueChange={(value) =>
                    setFormData({ ...formData, program: value })
                  }
                >
                  <SelectTrigger id="program">
                    <SelectValue placeholder="Yo'nalishni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="course_year">
                  Kurs <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.course_year.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, course_year: parseInt(value) })
                  }
                >
                  <SelectTrigger id="course_year">
                    <SelectValue placeholder="Kursni tanlang" />
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
                <Label htmlFor="is_active">Holat</Label>
                <Select
                  value={formData.is_active ? "true" : "false"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, is_active: value === "true" })
                  }
                >
                  <SelectTrigger id="is_active">
                    <SelectValue placeholder="Holatni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aktiv</SelectItem>
                    <SelectItem value="false">Aktiv emas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>
                  Tug&apos;ilgan sana{" "}
                  <span className="text-muted-foreground font-normal">(ixtiyoriy)</span>
                </Label>
                <DatePickerField
                  value={formData.birth_date}
                  onChange={(iso) => setFormData({ ...formData, birth_date: iso })}
                  disabled={!isAdmin}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/students")}
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
    </div>
  );
}
