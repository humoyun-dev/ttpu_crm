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
import { bot2Api, catalogApi, StudentRoster, CatalogItem } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";

export default function StudentFormPage() {
  const router = useRouter();
  const params = useParams();
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
        });
      }
    } catch (error) {
      console.error("Error loading roster:", error);
      alert("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.student_external_id || !formData.program) {
      alert("Barcha majburiy maydonlarni to'ldiring");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await bot2Api.createRoster(formData);
      } else {
        await bot2Api.updateRoster(id, formData);
      }
      router.push("/dashboard/students");
    } catch (error) {
      console.error("Error saving roster:", error);
      alert("Saqlashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
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
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/students")}
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
