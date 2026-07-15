"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchAccessLink, submitAccessLinkInterest, askAccessLink,
  AccessLinkPublic, AccessLinkStudent,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyStateRow } from "@/components/empty-state";
import { TableLoading } from "@/components/loading";
import { toast } from "sonner";
import {
  Building2, Loader2, AlertCircle, FileText, ExternalLink, Check, CheckCircle,
  MapPin, GraduationCap, Phone, User, Users, ShieldCheck, Sparkles, Send,
} from "lucide-react";

const GENDER_LABEL: Record<string, string> = { male: "Erkak", female: "Ayol" };
const DOC_LABEL: Record<string, string> = { cv: "CV", certificate: "Sertifikat" };

function fullName(s: AccessLinkStudent) {
  return `${s.first_name} ${s.last_name}`.trim() || s.student_external_id;
}

export default function AccessLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AccessLinkPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<AccessLinkStudent | null>(null);
  const [interested, setInterested] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const openCandidate = (s: AccessLinkStudent) => {
    setActive(s);
    setQuestion("");
    setAnswer("");
  };

  const askQuestion = async () => {
    if (!active || !question.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const res = await askAccessLink(token, active.lead_student_id, question.trim());
      setAnswer(res.data?.answer || "Hozircha javob berib bo'lmadi.");
    } catch {
      setAnswer("Hozircha javob berib bo'lmadi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setAsking(false);
    }
  };

  useEffect(() => {
    fetchAccessLink(token)
      .then(res => {
        if (res.error || !res.data) {
          setError("Havola topilmadi yoki muddati o'tgan.");
          return;
        }
        setData(res.data);
        const init: Record<string, boolean> = {};
        res.data.students.forEach(s => { if (s.employer_interested) init[s.lead_student_id] = true; });
        setInterested(init);
      })
      .catch(() => setError("Havola topilmadi yoki muddati o'tgan."))
      .finally(() => setLoading(false));
  }, [token]);

  const markInterest = async (s: AccessLinkStudent) => {
    setSubmitting(s.lead_student_id);
    try {
      const res = await submitAccessLinkInterest(token, s.lead_student_id);
      if (res.error) {
        toast.error("Qiziqishni yuborishda xatolik. Iltimos, qayta urinib ko'ring.");
        return;
      }
      setInterested(prev => ({ ...prev, [s.lead_student_id]: true }));
    } catch {
      toast.error("Qiziqishni yuborishda xatolik. Iltimos, qayta urinib ko'ring.");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-4">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">TTPU Bandlik Markazi</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <Card>
            <CardContent className="p-4">
              <TableLoading rows={6} cols={6} />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-center text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const students = data?.students ?? [];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-4">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">TTPU Bandlik Markazi</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Lead title */}
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Ish o&apos;rni taklifi
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">{data?.title}</h1>
          <p className="text-muted-foreground">{data?.employer}</p>
          <div className="relative mt-3 h-px w-full max-w-xs bg-border">
            <span className="absolute left-0 top-0 h-px w-12 bg-accent-gold" />
          </div>
        </div>

        {/* Candidates table */}
        <Card>
          <CardHeader className="pb-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Nomzodlar · <span className="tabular-nums">{students.length}</span> ta
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomzod</TableHead>
                    <TableHead>Yo&apos;nalish</TableHead>
                    <TableHead className="text-center">Kurs</TableHead>
                    <TableHead>Hudud</TableHead>
                    <TableHead className="text-center">Hujjatlar</TableHead>
                    <TableHead className="text-right">Holat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <EmptyStateRow colSpan={6} icon={Users} title="Nomzod yo'q" />
                  ) : (
                    students.map(s => (
                      <TableRow key={s.lead_student_id}
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => openCandidate(s)}>
                        <TableCell>
                          <div className="font-medium">{fullName(s)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{s.student_external_id}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.program || "—"}</TableCell>
                        <TableCell className="text-center font-mono tabular-nums text-muted-foreground">
                          {s.course ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.region || "—"}</TableCell>
                        <TableCell className="text-center">
                          {s.documents.length > 0 ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                              <FileText className="h-3.5 w-3.5" />{s.documents.length}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {interested[s.lead_student_id] ? (
                            <Badge className="gap-1 border-transparent bg-success/15 text-success">
                              <Check className="h-3 w-3" /> Qiziqildi
                            </Badge>
                          ) : (
                            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                              Ko&apos;rish →
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Ushbu havola faqat siz uchun. Talabalar ma&apos;lumoti maxfiy saqlanadi.
        </p>
      </main>

      {/* Profil oynasi */}
      <Dialog open={!!active} onOpenChange={o => !o && setActive(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                  {fullName(active)}
                </DialogTitle>
                <DialogDescription className="font-mono">{active.student_external_id}</DialogDescription>
              </DialogHeader>

              {/* Ma'lumotlar */}
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 py-1 sm:grid-cols-2">
                <InfoRow icon={<GraduationCap className="h-4 w-4" />} label="Yo'nalish" value={active.program} />
                <InfoRow icon={<GraduationCap className="h-4 w-4" />} label="Kurs" value={active.course != null ? `${active.course}-kurs` : null} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Hudud" value={active.region} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Jins" value={GENDER_LABEL[active.gender] ?? null} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefon"
                  value={active.phone}
                  fallback={active.shared ? "—" : "Markaz orqali bog'laning"} />
              </div>

              {/* AI tahlili (strukturali) */}
              <div className="space-y-2.5 border-t border-border pt-4">
                <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent-gold" /> AI tahlili
                </p>
                {active.ai_profile ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3.5">
                    {active.ai_profile.headline && <p className="text-sm font-semibold">{active.ai_profile.headline}</p>}
                    {active.ai_profile.education && <p className="text-xs text-muted-foreground">{active.ai_profile.education}</p>}
                    {active.ai_profile.skills.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Ko&apos;nikmalar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {active.ai_profile.skills.map((s, i) => <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>)}
                        </div>
                      </div>
                    )}
                    {active.ai_profile.languages.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tillar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {active.ai_profile.languages.map((l, i) => <Badge key={i} variant="outline" className="text-xs">{l}</Badge>)}
                        </div>
                      </div>
                    )}
                    {active.ai_profile.experience.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tajriba / Loyihalar</p>
                        <ul className="space-y-1">
                          {active.ai_profile.experience.map((e, i) => (
                            <li key={i} className="flex gap-2 text-sm">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-gold" />
                              <span>{e}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {active.ai_profile.fit && (
                      <div className="flex items-center gap-2 border-t border-border pt-2.5 text-sm">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Mos lavozim:</span>
                        <span className="font-medium">{active.ai_profile.fit}</span>
                      </div>
                    )}
                  </div>
                ) : active.ai_summary ? (
                  <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">{active.ai_summary}</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI tahlili tayyorlanmoqda — birozdan so&apos;ng sahifani yangilang.
                  </p>
                )}
              </div>

              {/* Hujjatlar */}
              <div className="space-y-2 border-t border-border pt-4">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Hujjatlar
                </p>
                {active.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Hujjat yuklanmagan.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {active.documents.map(d => (
                      <a key={d.id} href={d.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary hover:bg-muted/40">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{DOC_LABEL[d.type] ?? d.type}</span>
                          <span className="block truncate text-xs text-muted-foreground">{d.filename}</span>
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* AI savol-javob */}
              <div className="space-y-2 border-t border-border pt-4">
                <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent-gold" /> Nomzod haqida so&apos;rang
                </p>
                <div className="flex gap-2">
                  <Input value={question} onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") askQuestion(); }}
                    placeholder="Masalan: Qanday loyihalarda ishlagan?" className="h-9" />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={askQuestion}
                    disabled={asking || !question.trim()}
                    aria-label="Yuborish"
                    title="Yuborish"
                  >
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {answer && (
                  <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                    {answer}
                  </p>
                )}
              </div>

              {/* Qiziqish */}
              <div className="border-t border-border pt-4">
                {interested[active.lead_student_id] ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 py-3 text-sm font-medium text-success">
                    <CheckCircle className="h-5 w-5" />
                    Qiziqish bildirildi — markaz siz bilan bog'lanadi
                  </div>
                ) : (
                  <Button className="w-full" size="lg" disabled={submitting === active.lead_student_id}
                    onClick={() => markInterest(active)}>
                    {submitting === active.lead_student_id
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Yuborilmoqda...</>
                      : "Qiziqaman — bog'laning"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value, fallback = "—" }: {
  icon: React.ReactNode; label: string; value: string | null; fallback?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || fallback}</p>
      </div>
    </div>
  );
}
