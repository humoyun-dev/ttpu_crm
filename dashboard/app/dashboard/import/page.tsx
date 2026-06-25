"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { rosterApi, RosterImportResult } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

type ImportResult = RosterImportResult;

const RULES = [
  "Birinchi qator — ustun nomlari; har bir keyingi qator — bitta talaba.",
  "Faqat student_id majburiy, qolgan ustunlar ixtiyoriy.",
  "Bir xil student_id qayta yuklansa, mavjud talaba yangilanadi (dublikat yaratilmaydi).",
  ".xlsx, .xls va .csv — uchchalasi ham bir xil ishlaydi.",
];

const COLUMNS: { name: string; required?: boolean; desc: string; example: string }[] = [
  { name: "student_id", required: true, desc: "Talaba ID raqami (unikal kalit)", example: "U2024001" },
  { name: "ism", desc: "Talaba ismi", example: "Ali" },
  { name: "familya", desc: "Talaba familyasi", example: "Valiyev" },
  { name: "tug'ilgan sana", desc: "Tug'ilgan sana — KK.OO.YYYY", example: "15.03.2002" },
  { name: "program_code", desc: "Dastur / yo'nalish kodi (katalogda mavjud)", example: "PA" },
  { name: "course_year", desc: "Kurs — 1-4 aktiv, 5 = bitirgan", example: "1" },
  { name: "is_active", desc: "Aktivmi — true / false", example: "true" },
];

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Faqat .xlsx, .xls yoki .csv fayllar qabul qilinadi");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await rosterApi.import(file);
      if (res.error) {
        const message = Array.isArray(res.error.message)
          ? res.error.message.join(", ")
          : res.error.message;
        toast.error(message || "Import xatosi");
        return;
      }
      const data = res.data;
      if (!data) {
        toast.error("Import xatosi");
        return;
      }
      setResult(data);
      if (data.errors?.length === 0) {
        toast.success(`✓ Import yakunlandi: ${data.created} yangi, ${data.updated} yangilandi`);
      } else {
        toast.warning(`Import yakunlandi, lekin ${data.errors.length} ta xato bor`);
      }
    } catch {
      toast.error("Server bilan bog'lanishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Talabalar / Import"
        title="Talabalar importi"
        description="Excel (.xlsx / .xls) yoki CSV fayldan talabalar ro'yxatini bazaga yuklang."
      />

      {/* Upload — asosiy amal */}
      <section className="space-y-3">
        <div
          className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors
            ${dragging ? "border-accent-gold bg-accent-gold/5" : "border-border hover:border-accent-gold/60 hover:bg-muted/30"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              file ? "bg-accent-gold/15 text-accent-gold" : "bg-muted text-muted-foreground"
            }`}
          >
            {file ? <CheckCircle2 className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
          </div>
          {file ? (
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB · almashtirish uchun bosing
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Faylni shu yerga tashlang</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                yoki tanlash uchun bosing · .xlsx, .xls, .csv
              </p>
            </div>
          )}
        </div>

        <Button onClick={onImport} disabled={!file || loading} size="lg" className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          {loading ? "Yuklanmoqda..." : "Import qilish"}
        </Button>
      </section>

      {/* Natija */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {result.errors.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <CardTitle>Import natijasi</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Reestr-uslubidagi statistika */}
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border">
              <div className="px-4 py-3 text-center">
                <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
                  {result.created}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Yangi</p>
              </div>
              <div className="border-l border-border px-4 py-3 text-center">
                <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">{result.updated}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Yangilandi</p>
              </div>
              <div className="border-l border-border px-4 py-3 text-center">
                <p
                  className={`font-mono text-2xl font-semibold tabular-nums ${
                    result.errors.length ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {result.errors.length}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Xato</p>
              </div>
            </div>

            {/* Import qilingan talabalar */}
            {result.students.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Import qilingan talabalar
                </p>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Ism familya</TableHead>
                        <TableHead>Dastur</TableHead>
                        <TableHead className="text-center">Kurs</TableHead>
                        <TableHead className="text-center">Holat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.students.map((s) => (
                        <TableRow key={s.row}>
                          <TableCell className="font-mono text-xs">{s.student_external_id}</TableCell>
                          <TableCell className="text-sm">
                            {[s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell className="text-sm">{s.program || "—"}</TableCell>
                          <TableCell className="text-center font-mono text-sm tabular-nums">
                            {s.course_year ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={s.status === "created" ? "default" : "secondary"}
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {s.status === "created" ? "Yangi" : "Yangilandi"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Xatolar */}
            {result.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Xatolar
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {result.errors.map((e) => (
                    <div key={e.row} className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <span className="text-xs">
                        <Badge variant="outline" className="mr-1.5 px-1 py-0 font-mono text-[10px]">
                          {e.row}-qator
                        </Badge>
                        {e.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fayl talablari — ma'lumotnoma */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Fayl talablari</CardTitle>
          <CardDescription className="text-xs">
            Birinchi qator — ustun nomlari. Faqat <code className="font-mono">student_id</code> majburiy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Qoidalar */}
          <ul className="space-y-1.5">
            {RULES.map((rule) => (
              <li key={rule} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-gold" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          {/* Ustunlar */}
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ustun</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead>Namuna</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COLUMNS.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">
                          {c.name}
                        </code>
                        {c.required ? (
                          <Badge className="px-1 py-0 text-[10px]">majburiy</Badge>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground">ixtiyoriy</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.desc}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{c.example}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Eslatmalar */}
          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1.5">
              <p>
                <strong className="font-medium text-foreground">program_code</strong> katalogda mavjud bo&apos;lishi
                kerak. Dastur va kurs ixtiyoriy — keyinchalik bot orqali to&apos;ldiriladi.
              </p>
              <p>
                Muqobil nomlar: <code className="font-mono">id</code>, <code className="font-mono">first_name</code>,{" "}
                <code className="font-mono">last_name</code>, <code className="font-mono">birth_date</code>. Ism+familyani{" "}
                <code className="font-mono">ism familya</code> bitta ustunda ham berish mumkin.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
