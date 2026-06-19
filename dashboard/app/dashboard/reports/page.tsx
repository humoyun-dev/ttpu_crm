"use client";

import { useEffect, useState } from "react";
import { reportApi, StudentsByDirectionRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hisobotlar</h1>
          <p className="text-sm text-muted-foreground">Yo'nalish bo'yicha talabalar</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleDownload} disabled={downloading}>
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Yuklanmoqda..." : "XLSX"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Jami talabalar</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>So'rovnomada</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{totalRegistered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Ish topganlar</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{totalEmployed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Bandlik %</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {total > 0 ? Math.round((totalEmployed / total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
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
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right text-blue-600">{r.registered}</TableCell>
                    <TableCell className="text-right text-green-600">{r.employed}</TableCell>
                    <TableCell className="text-right">
                      <span className={r.employed_pct >= 50 ? "text-green-600" : r.employed_pct >= 25 ? "text-yellow-600" : "text-red-500"}>
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
