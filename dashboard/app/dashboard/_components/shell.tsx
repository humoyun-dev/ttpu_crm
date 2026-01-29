"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  GraduationCap,
  Building2,
  FlaskConical,
  BookOpenCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type IconType = React.ComponentType<{ className?: string }>;

export type MainSection = "applications" | "analytics";
export type SubSection =
  | "admissions"
  | "campus"
  | "polito"
  | "foundation"
  | "surveys"
  | "analytics_admissions"
  | "analytics_campus"
  | "analytics_polito"
  | "analytics_foundation"
  | "analytics_surveys";

type ApiItem = {
  id?: string;
  status?: string;
  submitted_at?: string;
  created_at?: string;
  applicant?: string;
  student?: string;
  answers?: { status?: string };
  [key: string]: unknown;
};

const sidebarMain: { id: MainSection; label: string; icon: IconType; href: string }[] = [
  { id: "applications", label: "Arizalar", icon: ClipboardList, href: "/dashboard/applications" },
  { id: "analytics", label: "Analitika", icon: BarChart3, href: "/dashboard/analytics" },
];

const sidebarSecondary: Record<MainSection, { id: SubSection; label: string; icon: IconType }[]> = {
  applications: [
    { id: "admissions", label: "Qabul 2026", icon: GraduationCap },
    { id: "campus", label: "Campus Tour", icon: Building2 },
    { id: "polito", label: "Polito Academy", icon: FlaskConical },
    { id: "foundation", label: "Foundation Year", icon: BookOpenCheck },
    { id: "surveys", label: "So'rovnomalar", icon: Users },
  ],
  analytics: [
    { id: "analytics_admissions", label: "Qabul 2026", icon: GraduationCap },
    { id: "analytics_campus", label: "Campus Tour", icon: Building2 },
    { id: "analytics_polito", label: "Polito Academy", icon: FlaskConical },
    { id: "analytics_foundation", label: "Foundation", icon: BookOpenCheck },
    { id: "analytics_surveys", label: "So'rovnomalar", icon: Users },
  ],
};

const endpointMap: Record<SubSection, string> = {
  admissions: "bot1/applications/admissions-2026",
  campus: "bot1/applications/campus-tour",
  polito: "bot1/applications/polito-academy",
  foundation: "bot1/applications/foundation",
  surveys: "bot2/surveys",
  analytics_admissions: "",
  analytics_campus: "",
  analytics_polito: "",
  analytics_foundation: "",
  analytics_surveys: "",
};

export function DashboardShell({ initialMain }: { initialMain: MainSection }) {
  const router = useRouter();
  const [main] = useState<MainSection>(initialMain);
  const [sub, setSub] = useState<SubSection>(
    initialMain === "applications" ? "admissions" : "analytics_admissions"
  );
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // Simple auth guard based on localStorage token
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) router.push("/");
  }, [router]);

  const handleMainSwitch = (section: MainSection) => {
    const target = sidebarMain.find((m) => m.id === section);
    if (target) router.push(target.href);
  };

  // Fetch list on sub change (applications only for now)
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (sub.startsWith("analytics")) {
        setItems([]);
        return;
      }
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const endpoint = endpointMap[sub];
      if (!endpoint) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/v1/${endpoint}/`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/");
            return;
          }
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || res.statusText);
        }
        const data = await res.json();
        const results = Array.isArray(data) ? data : data.results ?? [];
        if (active) setItems(results as ApiItem[]);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "Yuklab bo'lmadi");
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [sub, apiBase, router]);

  const pageTitle = useMemo(() => {
    const current = sidebarSecondary[main]?.find((s) => s.id === sub);
    return current?.label ?? "Dashboard";
  }, [main, sub]);

  const renderRow = (item: ApiItem) => {
    const rawStatus =
      typeof item.status === "string"
        ? item.status
        : typeof item.answers?.status === "string"
        ? item.answers.status
        : "-";
    const status = rawStatus || "-";
    const created = (item.submitted_at || item.created_at || "-") as string;
    const applicant = (item.applicant || item.student || "-") as string;
    return (
      <button
        key={item.id as string}
        onClick={() => {
          if (!sub.startsWith("analytics") && item.id) {
            router.push(`/dashboard/applications/${sub}/${item.id}`);
          }
        }}
        className="grid grid-cols-4 items-center gap-4 rounded-lg border border-white/5 bg-white/5 px-4 py-3 text-left text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/10"
      >
        <div className="truncate font-medium">{item.id}</div>
        <div className="text-slate-300">{status}</div>
        <div className="text-slate-400">{created}</div>
        <div className="text-slate-400">{applicant}</div>
      </button>
    );
  };

  return (
    <div className="grid min-h-screen grid-cols-[260px_200px_1fr] bg-background text-foreground">
      {/* Primary sidebar */}
      <aside className="flex flex-col gap-6 border-r bg-card px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-500/40">
            <LayoutDashboard className="h-6 w-6 text-indigo-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">TTPU CRM</p>
            <p className="text-base font-semibold text-white">Dashboard</p>
          </div>
        </div>

        <nav className="space-y-2">
          {sidebarMain.map((item) => {
            const Icon = item.icon;
            const active = item.id === main;
            return (
              <button
                key={item.id}
                onClick={() => handleMainSwitch(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-indigo-500/20 text-white ring-1 ring-indigo-400/50"
                    : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Secondary sidebar */}
      <aside className="border-r bg-muted/30 px-5 py-8">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">
          {main === "applications" ? "Arizalar" : "Analitika"}
        </p>
        <div className="space-y-2">
          {sidebarSecondary[main].map((item) => {
            const Icon = item.icon;
            const active = item.id === sub;
            return (
              <button
                key={item.id}
                onClick={() => setSub(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-white/10 text-white ring-1 ring-white/15"
                    : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Content area */}
      <main className="px-10 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {main === "applications" ? "Bo'lim" : "Analitika"}
            </p>
            <h1 className="text-2xl font-semibold text-white">{pageTitle}</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            Beta
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{pageTitle}</CardTitle>
            <CardDescription>
              {sub.startsWith("analytics")
                ? "Analitika ko‘rsatkichlari keyingi bosqichda qo‘shiladi."
                : "Arizalar ro‘yxati real vaqt rejimida yuklanadi."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Separator className="mb-6" />
            {sub.startsWith("analytics") ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                Analitika bo‘limi tez orada ulab qo‘yiladi.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>ID / Status / Sana / Foydalanuvchi</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={loading}
                      onClick={() => setSub(sub)}
                    >
                      Yangilash
                    </Button>
                  </div>
                </div>
                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                )}
                {loading ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    Yuklanmoqda...
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    Hozircha ma&apos;lumot yo&apos;q.
                  </div>
                ) : (
                  <div className="space-y-2">{items.map(renderRow)}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
