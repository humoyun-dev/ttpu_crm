"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { leadApi, Lead, LeadStatus, LEAD_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, Check, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

const STATUS_BADGE: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
  created: "outline",
  sent: "secondary",
  viewing: "secondary",
  selected: "default",
  closed: "destructive",
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leadApi.get(id);
      if (res.error) throw new Error();
      setLead(res.data!);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const accessUrl = lead?.access_link
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/l/${lead.access_link.token}`
    : "";

  const copyLink = async () => {
    if (!accessUrl) return;
    await navigator.clipboard.writeText(accessUrl);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddStudent = async () => {
    if (!studentId.trim()) { toast.error("Student ID kiritilmadi"); return; }
    setAdding(true);
    try {
      const res = await leadApi.addStudent(id, studentId.trim());
      if (res.error) throw new Error(res.error.message as string);
      toast.success("Talaba qo'shildi");
      setShowAdd(false);
      setStudentId("");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Talaba qo'shishda xatolik");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Yuklanmoqda...
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Lead topilmadi.{" "}
        <Link href="/dashboard/leads" className="underline">Orqaga</Link>
      </div>
    );
  }

  const students = lead.lead_students ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Boshqaruv / Leadlar"
        title={lead.title}
        description={lead.employer_name}
        actions={
          <>
            <Badge variant={STATUS_BADGE[lead.status]} className="font-mono text-[11px] uppercase tracking-wider">
              {LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/leads">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Orqaga
              </Link>
            </Button>
          </>
        }
      />

      {lead.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {accessUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ish beruvchi havolasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                {accessUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-accent-gold" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-baseline gap-2 text-base">
            Talabalar
            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              {students.length}
            </span>
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="mr-2 h-3.5 w-3.5" /> Qo&apos;shish
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Ismi</TableHead>
                <TableHead className="text-center">Qiziqish</TableHead>
                <TableHead className="text-center">Yo&apos;naltirildi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Hali talaba qo&apos;shilmagan
                  </TableCell>
                </TableRow>
              ) : (
                students.map(s => (
                  <TableRow key={s.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs tabular-nums">{s.student_external_id}</TableCell>
                    <TableCell className="text-sm">{s.student_name || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={s.employer_interested ? "default" : "outline"} className="text-[11px]">
                        {s.employer_interested ? "Ha" : "Yo'q"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={s.forwarded ? "default" : "outline"} className="text-[11px]">
                        {s.forwarded ? "Ha" : "Yo'q"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Talaba qo'shish</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Student ID (tashqi)</Label>
            <Input
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="Masalan: u2101234"
              onKeyDown={e => e.key === "Enter" && handleAddStudent()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Bekor</Button>
            <Button onClick={handleAddStudent} disabled={adding}>{adding ? "Qo'shilmoqda..." : "Qo'shish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
