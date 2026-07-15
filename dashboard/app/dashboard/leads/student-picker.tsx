"use client";

import { useEffect, useMemo, useState } from "react";
import { bot2Api, catalogApi, leadApi, Bot2Student, CatalogItem } from "@/lib/api";
import { useSearch } from "@/lib/hooks/use-search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, X, Users, MapPin, Loader2, UserPlus, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export function studentName(s: Bot2Student): string {
  return `${s.first_name} ${s.last_name}`.trim() || s.student_external_id;
}
function regionLabel(s: Bot2Student): string {
  return s.region_details?.name_uz || s.region_details?.name || "";
}
function scoreColor(score: number): string {
  if (score >= 75) return "bg-success/15 text-success";
  if (score >= 50) return "bg-warning/15 text-warning";
  return "bg-muted text-muted-foreground";
}

interface Match { score: number; reason: string }

interface Props {
  selected: Record<string, Bot2Student>;
  onToggle: (s: Bot2Student) => void;
  onClearAll: () => void;
  /** Allaqachon leadda bo'lgan talaba id'lari — ro'yxatdan yashiriladi. */
  excludeIds?: Set<string>;
  /** Berilsa "AI tartiblash" tugmasi chiqadi (ish o'rni talabi: sarlavha + izoh). */
  requirement?: string;
}

export function StudentPicker({ selected, onToggle, onClearAll, excludeIds, requirement }: Props) {
  const [regions, setRegions] = useState<CatalogItem[]>([]);
  const [programs, setPrograms] = useState<CatalogItem[]>([]);
  const { searchTerm, debouncedSearch, setSearch } = useSearch();
  const [region, setRegion] = useState("all");
  const [gender, setGender] = useState("all");
  const [program, setProgram] = useState("all");
  const [course, setCourse] = useState("all");
  const [docStatus, setDocStatus] = useState("all");

  const [students, setStudents] = useState<Bot2Student[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [matching, setMatching] = useState(false);
  const [ranked, setRanked] = useState(false);

  useEffect(() => {
    catalogApi.list("region").then(r => setRegions(r.data?.results ?? []));
    catalogApi.list("direction").then(r => setPrograms(r.data?.results ?? []));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { page_size: String(PAGE_SIZE) };
    if (debouncedSearch) params.search = debouncedSearch;
    if (region !== "all") params.region = region;
    if (gender !== "all") params.gender = gender;
    if (program !== "all") params.program = program;
    if (course !== "all") params.course_year = course;
    if (docStatus !== "all") params.doc_status = docStatus;

    let ignore = false;
    setLoading(true);
    bot2Api.listStudents(params)
      .then(r => {
        if (ignore) return;
        setStudents(r.data?.results ?? []);
        setStudentCount(r.data?.count ?? 0);
        setMatches({});
        setRanked(false);
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [debouncedSearch, region, gender, program, course, docStatus]);

  const visible = useMemo(
    () => (excludeIds ? students.filter(s => !excludeIds.has(s.id)) : students),
    [students, excludeIds],
  );

  const sorted = useMemo(() => {
    if (!ranked) return visible;
    return [...visible].sort((a, b) => (matches[b.id]?.score ?? -1) - (matches[a.id]?.score ?? -1));
  }, [visible, ranked, matches]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const handleMatch = async () => {
    const req = (requirement || "").trim();
    if (!req) { toast.error("Avval sarlavha kiriting"); return; }
    if (visible.length === 0) return;
    setMatching(true);
    try {
      const res = await leadApi.matchCandidates(req, visible.map(s => s.id));
      if (res.error || !res.data) { toast.error("AI tartiblash xatosi"); return; }
      const m: Record<string, Match> = {};
      for (const r of res.data.ranked) m[r.student_id] = { score: r.score, reason: r.reason };
      setMatches(m);
      setRanked(true);
      toast.success("Nomzodlar moslik bo'yicha tartiblandi");
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setMatching(false);
    }
  };

  const selectTop = () => {
    sorted.slice(0, 10).forEach(s => {
      if ((matches[s.id]?.score ?? 0) > 0 && !selected[s.id]) onToggle(s);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Chap: ro'yxat + filtr */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border">
        <div className="space-y-2 border-b border-border bg-muted/30 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearch(e.target.value)}
              placeholder="Ism, ID yoki telefon..." className="h-9 pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha yo&apos;nalishlar</SelectItem>
                {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name_uz || p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha kurslar</SelectItem>
                {[1, 2, 3, 4].map(y => <SelectItem key={y} value={String(y)}>{y}-kurs</SelectItem>)}
                <SelectItem value="5">Bitirgan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha hududlar</SelectItem>
                {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name_uz || r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha jins</SelectItem>
                <SelectItem value="male">Erkak</SelectItem>
                <SelectItem value="female">Ayol</SelectItem>
              </SelectContent>
            </Select>
            <div className="col-span-2">
              <Select value={docStatus} onValueChange={setDocStatus}>
                <SelectTrigger className="h-9 w-full rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Hujjat: barchasi</SelectItem>
                  <SelectItem value="verified">Tasdiqlangan hujjatli</SelectItem>
                  <SelectItem value="unverified">Tasdiqlanmagan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {requirement !== undefined && (
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 flex-1"
                onClick={handleMatch} disabled={matching || visible.length === 0}>
                {matching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-accent-gold" />}
                AI tartiblash
              </Button>
              {ranked && (
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={selectTop}>
                  Eng mos 10 tasi
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="h-72 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-7 w-7 opacity-30" />
              Talaba topilmadi
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map(s => {
                const isSel = !!selected[s.id];
                const m = matches[s.id];
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => onToggle(s)}
                      title={m?.reason || ""}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${isSel ? "bg-primary/5" : ""}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                        {isSel && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{studentName(s)}</span>
                          {s.doc_verified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />}
                        </span>
                        <span className="flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
                          {s.student_external_id}
                          {regionLabel(s) && (
                            <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{regionLabel(s)}</span>
                          )}
                        </span>
                        {(s.program_name || s.course_year != null) && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[s.program_name, s.course_year != null ? `${s.course_year}-kurs` : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      {m && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${scoreColor(m.score)}`}>
                          {m.score}%
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {studentCount > visible.length
            ? `Ko'rsatilmoqda: ${visible.length} / ${studentCount} — qidiruv bilan toraytiring`
            : `${visible.length} ta talaba`}
        </div>
      </div>

      {/* O'ng: tanlanganlar */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            Tanlangan
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {selectedList.length}
            </span>
          </span>
          {selectedList.length > 0 && (
            <button type="button" onClick={onClearAll}
              className="text-xs text-muted-foreground underline hover:text-foreground">
              Tozalash
            </button>
          )}
        </div>
        <div className="h-[calc(18rem+2.5rem)] overflow-y-auto">
          {selectedList.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <UserPlus className="h-7 w-7 opacity-30" />
              Chapdan talaba tanlang
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {selectedList.map(s => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{studentName(s)}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{s.student_external_id}</span>
                  </span>
                  {matches[s.id] && (
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${scoreColor(matches[s.id].score)}`}>
                      {matches[s.id].score}%
                    </span>
                  )}
                  <button type="button" onClick={() => onToggle(s)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
