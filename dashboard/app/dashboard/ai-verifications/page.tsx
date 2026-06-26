"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Upload, Search, FileText, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatDate } from "@/lib/api";
import {
  aiVerifyApi, bot2Api, DocumentVerification, AIVerifyStats,
  AIConfidence, AIDecision, AIDocumentType, Bot2Student,
} from "@/lib/api";

const CONF: Record<string, { label: string; cls: string; dot: string }> = {
  green: { label: "Tasdiqlandi", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500" },
  yellow: { label: "Shubhali", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
  red: { label: "Ko'rib chiqilsin", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", dot: "bg-red-500" },
};
const DECISION: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Kutilmoqda", variant: "outline" },
  accepted: { label: "Tasdiqlandi", variant: "default" },
  rejected: { label: "Rad etildi", variant: "destructive" },
};
const DOCTYPE: Record<string, string> = {
  cv: "CV", ielts: "IELTS", certificate: "Sertifikat", diploma: "Diplom", other: "Boshqa",
};
const STATUS: Record<string, string> = {
  pending: "Navbatda", processing: "Tahlilda", done: "Tayyor", failed: "Xatolik",
};
const ALL = "__all__";

// Texnik maydon nomlarini o'qishli yorliqqa aylantirish (CV / IELTS / sertifikat / diplom).
const FIELD_LABELS: Record<string, string> = {
  full_name: "To'liq ism", email: "Email", phone: "Telefon",
  skills: "Ko'nikmalar", education: "Ta'lim", work_experience: "Ish tajribasi",
  languages: "Tillar",
  candidate_name: "Nomzod", test_date: "Test sanasi", overall_band: "Umumiy ball",
  listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking",
  certificate_number: "Sertifikat raqami", test_type: "Test turi",
  recipient_name: "Egasi", issuing_organization: "Bergan tashkilot",
  certificate_title: "Nomi", issue_date: "Berilgan sana", expiry_date: "Amal qiladi",
  graduate_name: "Bitiruvchi", university_name: "Universitet", degree: "Daraja",
  major: "Yo'nalish", graduation_year: "Bitirgan yili", diploma_number: "Diplom raqami",
  // ichki obyekt maydonlari
  year: "Yil", university: "Universitet", company: "Kompaniya", role: "Lavozim",
  start: "Boshlanish", end: "Tugash", level: "Daraja", language: "Til",
};

function labelOf(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Qiymat "bo'sh"mi? (null, "null", "", [], {})
function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "" || v.trim().toLowerCase() === "null";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

// Bitta obyektni o'qishli qatorga aylantirish: "Daraja · Universitet · Yil"
function objectToLine(obj: unknown): string {
  if (obj == null || typeof obj !== "object") return String(obj ?? "");
  return Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => !isEmpty(v))
    .map(([, v]) => String(v))
    .join(" · ");
}

function ExtractedValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    // String massiv → chiplar; obyekt massiv → har biri alohida qator.
    if (value.every((x) => typeof x !== "object" || x === null)) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((x, i) => (
            <Badge key={i} variant="secondary" className="font-normal">{String(x)}</Badge>
          ))}
        </div>
      );
    }
    return (
      <ul className="space-y-0.5">
        {value.map((x, i) => (
          <li key={i} className="text-foreground">• {objectToLine(x as Record<string, unknown>)}</li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === "object") {
    return <span>{objectToLine(value as Record<string, unknown>)}</span>;
  }
  return <span>{String(value)}</span>;
}

function ConfBadge({ level }: { level: AIConfidence | null }) {
  if (!level) return <span className="text-muted-foreground">—</span>;
  const c = CONF[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function AIVerificationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [stats, setStats] = useState<AIVerifyStats | null>(null);
  const [items, setItems] = useState<DocumentVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confFilter, setConfFilter] = useState<string>(ALL);
  const [decisionFilter, setDecisionFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<DocumentVerification | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (confFilter !== ALL) params.confidence_level = confFilter;
    if (decisionFilter !== ALL) params.final_decision = decisionFilter;
    if (typeFilter !== ALL) params.document_type = typeFilter;
    if (search.trim()) params.search = search.trim();

    const [listRes, statsRes] = await Promise.all([
      aiVerifyApi.list(params),
      aiVerifyApi.getStats(),
    ]);
    if (listRes.error) {
      setError(Array.isArray(listRes.error.message) ? listRes.error.message.join(", ") : listRes.error.message);
      setLoading(false);
      return;
    }
    setItems(listRes.data?.results ?? []);
    setStats(statsRes.data ?? null);
    setLoading(false);
  }, [confFilter, decisionFilter, typeFilter, search]);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load, reloadKey]);

  if (!isAdmin) return <ErrorDisplay message="Bu bo'lim faqat administratorlar uchun." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talabalar / AI"
        title="AI Hujjat Tekshiruvi"
        description="Gemini tekshirgan hujjatlar — toifaga ko'ra ko'rib chiqing va yakuniy qaror qabul qiling."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-2 h-4 w-4" /> Yangilash
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Hujjat yuklash
            </Button>
          </>
        }
      />

      {/* 3-toifa kartalari (bosib filtrlash) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["green", "yellow", "red"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setConfFilter(confFilter === lvl ? ALL : lvl)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              confFilter === lvl ? "border-accent-gold bg-accent-gold/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${CONF[lvl].dot}`} />
              <span className="text-xs text-muted-foreground">{CONF[lvl].label}</span>
            </div>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {stats?.by_confidence[lvl] ?? 0}
            </p>
          </button>
        ))}
        <div className="rounded-lg border border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Qaror kutmoqda</span>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {stats?.by_decision.pending ?? 0}
          </p>
        </div>
      </div>

      {/* Filtrlar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Talaba ismi yoki ID..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <FilterSelect value={confFilter} onChange={setConfFilter} placeholder="Toifa"
          options={[["green", "Tasdiqlandi"], ["yellow", "Shubhali"], ["red", "Ko'rib chiqilsin"]]} />
        <FilterSelect value={decisionFilter} onChange={setDecisionFilter} placeholder="Qaror"
          options={[["pending", "Kutilmoqda"], ["accepted", "Tasdiqlandi"], ["rejected", "Rad etildi"]]} />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="Hujjat turi"
          options={[["cv", "CV"], ["ielts", "IELTS"], ["certificate", "Sertifikat"], ["diploma", "Diplom"], ["other", "Boshqa"]]} />
      </div>

      {/* Ro'yxat */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><TableLoading /></div>
          ) : error ? (
            <div className="p-6"><ErrorDisplay message={error} onRetry={reload} /></div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Hujjat topilmadi</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Talaba</TableHead>
                    <TableHead>Hujjat</TableHead>
                    <TableHead>AI toifa</TableHead>
                    <TableHead className="hidden md:table-cell">Ishonch</TableHead>
                    <TableHead>Qaror</TableHead>
                    <TableHead className="hidden lg:table-cell">Sana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((v) => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(v)}>
                      <TableCell className="pl-4 text-sm font-medium">
                        {v.student_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {DOCTYPE[v.document_type] ?? v.document_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {v.status === "failed"
                          ? <Badge variant="destructive" className="text-xs">Xatolik</Badge>
                          : <ConfBadge level={v.confidence_level} />}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground md:table-cell">
                        {v.confidence_score != null ? `${(v.confidence_score * 100).toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={DECISION[v.final_decision].variant} className="text-xs">
                          {DECISION[v.final_decision].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground lg:table-cell">
                        {formatDate(v.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <DetailDialog
          verification={selected}
          onClose={() => setSelected(null)}
          onReviewed={(updated) => {
            setSelected(updated);
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            reload();
          }}
        />
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { setUploadOpen(false); reload(); }}
      />
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[130px] text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: hammasi</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* ── Detail + review ── */
function DetailDialog({
  verification, onClose, onReviewed,
}: {
  verification: DocumentVerification;
  onClose: () => void;
  onReviewed: (v: DocumentVerification) => void;
}) {
  const [note, setNote] = useState(verification.review_note || "");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const v = verification;
  const isReady = v.status === "done";

  const review = async (body: { final_decision?: AIDecision; confidence_level?: AIConfidence }) => {
    setSaving(true);
    const res = await aiVerifyApi.review(v.id, { ...body, review_note: note });
    setSaving(false);
    if (res.error) {
      toast.error(Array.isArray(res.error.message) ? res.error.message.join(", ") : res.error.message);
      return;
    }
    if (res.data) { toast.success("Saqlandi"); onReviewed(res.data); }
  };

  const retry = async () => {
    setRetrying(true);
    const res = await aiVerifyApi.retry(v.id);
    setRetrying(false);
    if (res.error) {
      toast.error(Array.isArray(res.error.message) ? res.error.message.join(", ") : res.error.message);
      return;
    }
    if (res.data) {
      toast.success(res.data.status === "done" ? "Qayta tekshirildi" : "Qayta urinildi");
      onReviewed(res.data);
    }
  };

  // Faqat bo'sh bo'lmagan maydonlar — chalkashlikni kamaytirish uchun.
  const extracted = Object.entries(v.extracted_data || {}).filter(([, val]) => !isEmpty(val));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {v.student_name || "Hujjat"} — {DOCTYPE[v.document_type] ?? v.document_type}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {v.status === "failed"
              ? <Badge variant="destructive">Xatolik</Badge>
              : <ConfBadge level={v.confidence_level} />}
            <Badge variant="secondary" className="text-xs">
              {v.confidence_score != null ? `Ishonch: ${(v.confidence_score * 100).toFixed(0)}%` : "—"}
            </Badge>
            <Badge variant="outline" className="text-xs">{STATUS[v.status]}</Badge>
            <Badge variant={DECISION[v.final_decision].variant} className="text-xs">
              {DECISION[v.final_decision].label}
            </Badge>
            {v.status !== "processing" && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7"
                disabled={retrying}
                onClick={retry}
              >
                {retrying
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Qaytadan tekshirish
              </Button>
            )}
          </div>

          {v.ai_summary && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">
              {v.ai_summary}
            </div>
          )}
          {v.error_message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {v.error_message}
            </div>
          )}

          {v.flags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {v.flags.map((f) => (
                <Badge key={f} variant="outline" className="border-amber-300 text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {f}
                </Badge>
              ))}
            </div>
          )}

          {extracted.length > 0 && (
            <div className="rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Ajratilgan ma&apos;lumotlar
              </p>
              <dl className="divide-y">
                {extracted.map(([k, val]) => (
                  <div key={k} className="flex gap-3 px-3 py-2">
                    <dt className="min-w-[130px] shrink-0 text-muted-foreground">{labelOf(k)}</dt>
                    <dd className="flex-1 break-words font-medium">
                      <ExtractedValue value={val} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Admin: toifani o'zgartirish */}
          {isReady && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                AI toifasini o&apos;zgartirish
              </p>
              <div className="flex flex-wrap gap-2">
                {(["green", "yellow", "red"] as const).map((lvl) => (
                  <Button
                    key={lvl}
                    size="sm"
                    variant={v.confidence_level === lvl ? "default" : "outline"}
                    disabled={saving}
                    onClick={() => review({ confidence_level: lvl })}
                  >
                    <span className={`mr-2 h-2 w-2 rounded-full ${CONF[lvl].dot}`} />
                    {CONF[lvl].label}
                  </Button>
                ))}
              </div>

              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Sharh (ixtiyoriy)"
                className="min-h-[60px] text-sm"
              />
            </div>
          )}
        </div>

        {isReady && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" disabled={saving} onClick={() => review({ final_decision: "rejected" })}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Rad etish
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => review({ final_decision: "accepted" })}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Tasdiqlash
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Upload (yangi hujjat) ── */
function UploadDialog({
  open, onClose, onUploaded,
}: {
  open: boolean; onClose: () => void; onUploaded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Bot2Student[]>([]);
  const [student, setStudent] = useState<Bot2Student | null>(null);
  const [docType, setDocType] = useState<AIDocumentType>("cv");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    let ignore = false;
    const t = setTimeout(async () => {
      const res = await bot2Api.listStudents({ search: q.trim(), page_size: "8" });
      if (!ignore && res.data) setResults(res.data.results);
    }, 300);
    return () => { ignore = true; clearTimeout(t); };
  }, [q]);

  const submit = async () => {
    if (!student || !file) { toast.error("Talaba va fayl tanlang"); return; }
    setSubmitting(true);
    const res = await aiVerifyApi.submit(student.id, docType, file);
    setSubmitting(false);
    if (res.error) {
      toast.error(Array.isArray(res.error.message) ? res.error.message.join(", ") : res.error.message);
      return;
    }
    toast.success("Yuklandi va tekshirildi");
    setQ(""); setStudent(null); setFile(null); setResults([]);
    onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Hujjat yuklash</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Talaba qidirish */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Talaba</label>
            {student ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{student.first_name} {student.last_name} · {student.student_external_id}</span>
                <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>O&apos;zgartirish</Button>
              </div>
            ) : (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki ID bo'yicha qidirish..." className="h-9" />
                {results.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {results.map((s) => (
                      <button key={s.id} onClick={() => { setStudent(s); setResults([]); setQ(""); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50">
                        {s.first_name} {s.last_name} · <span className="font-mono text-xs">{s.student_external_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hujjat turi */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Hujjat turi</label>
            <Select value={docType} onValueChange={(v) => setDocType(v as AIDocumentType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DOCTYPE).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Fayl */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fayl (JPG, PNG, WEBP, PDF)</label>
            <Input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="h-9"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit} disabled={submitting || !student || !file}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Yuklash va tekshirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
