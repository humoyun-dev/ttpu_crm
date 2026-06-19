"use client";

import { useEffect, useState } from "react";
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

  const load = async () => {
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
  };

  useEffect(() => { load(); }, [id]);

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/leads"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{lead.title}</h1>
          <p className="text-sm text-muted-foreground">{lead.employer_name}</p>
        </div>
        <Badge variant={STATUS_BADGE[lead.status]}>
          {LEAD_STATUS_LABELS[lead.status]}
        </Badge>
      </div>

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
            <CardTitle className="text-sm">Ish beruvchi havolasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">{accessUrl}</code>
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Talabalar ({students.length})</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="mr-2 h-3.5 w-3.5" /> Qo'shish
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Ismi</TableHead>
                <TableHead>Qiziqish</TableHead>
                <TableHead>Yo'naltirildi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Hali talaba qo'shilmagan
                  </TableCell>
                </TableRow>
              ) : (
                students.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.student_external_id}</TableCell>
                    <TableCell>{s.student_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.employer_interested ? "default" : "outline"} className="text-xs">
                        {s.employer_interested ? "Ha" : "Yo'q"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.forwarded ? "default" : "outline"} className="text-xs">
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
