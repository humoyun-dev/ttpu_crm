"use client";

import { useEffect, useState } from "react";
import { reportApi, downloadFile, StudentsByDirectionRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, TrendingUp, Inbox } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorDisplay } from "@/components/error-display";
import { TableRowsSkeleton, Skeleton } from "@/components/skeleton";
import { EmptyStateRow } from "@/components/empty-state";

export default function ReportsPage() {
  const [rows, setRows] = useState<StudentsByDirectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportApi.studentsByDirection();
      if (res.error) {
        setError(
          Array.isArray(res.error.message)
            ? res.error.message.join(", ")
            : res.error.message,
        );
        return;
      }
      setRows(res.data ?? []);
    } catch {
      setError("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Bearer + refresh bilan yuklab olish — cookie muddati tugagan bo'lsa ham ishlaydi.
      const res = await downloadFile(
        "/api/v1/analytics/students-by-direction.xlsx",
        "students-by-direction.xlsx",
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Fayl yuklab olindi");
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
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              disabled={loading}
              aria-label="Yangilash"
              title="Yangilash"
            >
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
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {total.toLocaleString()}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Jami talabalar
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {totalRegistered.toLocaleString()}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            So&apos;rovnomada
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {totalEmployed.toLocaleString()}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Ish topganlar
          </p>
        </div>
        <div className="border-l border-border px-5 py-4">
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {total > 0 ? Math.round((totalEmployed / total) * 100) : 0}%
            </p>
          )}
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
          {error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={load} /></div>
          ) : (
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
                <TableRowsSkeleton rows={6} cols={5} />
              ) : rows.length === 0 ? (
                <EmptyStateRow colSpan={5} icon={Inbox} title="Ma'lumot topilmadi" />
              ) : (
                rows.map(r => (
                  <TableRow key={r.program_id}>
                    <TableCell className="font-medium">{r.program_name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{r.registered}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.employed}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono tabular-nums ${r.employed_pct >= 50 ? "text-success" : r.employed_pct >= 25 ? "text-warning" : "text-destructive"}`}>
                        {r.employed_pct}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
