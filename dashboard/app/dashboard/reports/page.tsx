"use client";

import { useEffect, useState } from "react";
import { reportApi, StudentsByDirectionRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

export default function ReportsPage() {
  const [rows, setRows] = useState<StudentsByDirectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reportApi.studentsByDirection();
      setRows(res.data ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = reportApi.xlsxUrl();
      const a = document.createElement("a");
      a.href = url;
      a.download = "students-by-direction.xlsx";
      a.click();
      toast.success("Fayl yuklanmoqda");
    } catch {
      toast.error("Yuklab olishda xatolik");
    } finally {
      setDownloading(false);
    }
  };

  const total = rows.reduce((s, r) => s + r.total, 0);
  const totalEmployed = rows.reduce((s, r) => s + r.employed, 0);
  const totalRegistered = rows.reduce((s, r) => s + r.registered, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analitika / Hisobotlar"
        title="Hisobotlar"
        description="Yo'nalish bo'yicha talabalar va bandlik ko'rsatkichlari."
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={handleDownload} disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Yuklanmoqda..." : "XLSX"}
            </Button>
          </>
        }
      />

      {/* Reestr-uslubidagi statistika */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
        <div className="px-5 py-4">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {total.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Jami talabalar
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {totalRegistered.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            So&apos;rovnomada
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {totalEmployed.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Ish topganlar
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {total > 0 ? Math.round((totalEmployed / total) * 100) : 0}%
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Bandlik %
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Yo'nalish bo'yicha batafsil
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Yo'nalish</TableHead>
                <TableHead className="text-right">Jami</TableHead>
                <TableHead className="text-right">So'rovnomada</TableHead>
                <TableHead className="text-right">Ish topgan</TableHead>
                <TableHead className="text-right">Bandlik</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Yuklanmoqda...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Ma'lumot yo'q
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(r => (
                  <TableRow key={r.program_id}>
                    <TableCell className="font-medium">{r.program_name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{r.registered}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.employed}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono tabular-nums ${r.employed_pct >= 50 ? "text-emerald-600 dark:text-emerald-500" : r.employed_pct >= 25 ? "text-amber-600 dark:text-amber-500" : "text-destructive"}`}>
                        {r.employed_pct}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
