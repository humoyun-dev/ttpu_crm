"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import {
  aiCostApi,
  AIUsageSummary,
  AIUsageDaily,
  AIUsageEstimate,
} from "@/lib/api";

/* USD ni o'qishli ko'rsatish — kichik summalar uchun ko'proq kasr. */
function usd(value: string | number, dp = 4): string {
  const n = typeof value === "number" ? value : parseFloat(value || "0");
  if (!isFinite(n)) return "$0";
  return `$${n.toFixed(n >= 1 ? 2 : dp)}`;
}

/* Yengil inline SVG ustun grafik — tashqi kutubxonasiz. */
function CostBars({ days }: { days: AIUsageDaily["days"] }) {
  if (days.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Hali ma&apos;lumot yo&apos;q
      </div>
    );
  }
  const costs = days.map((d) => parseFloat(d.cost_usd || "0"));
  const max = Math.max(...costs, 0.0000001);
  const W = 720;
  const H = 180;
  const gap = 4;
  const bw = Math.max(2, (W - gap * (days.length - 1)) / days.length);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-52 w-full min-w-[480px]" preserveAspectRatio="none">
        {days.map((d, i) => {
          const h = (parseFloat(d.cost_usd || "0") / max) * H;
          const x = i * (bw + gap);
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={Math.max(h, 1)}
                rx={1.5}
                className="fill-accent-gold"
              >
                <title>{`${d.date}: ${usd(d.cost_usd)} · ${d.requests} so'rov · ${d.tokens.toLocaleString()} token`}</title>
              </rect>
            </g>
          );
        })}
        {/* x o'qi chizig'i */}
        <line x1={0} y1={H} x2={W} y2={H} className="stroke-border" strokeWidth={1} />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-l border-border px-4 py-3.5 first:border-l-0">
      <p
        className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${
          accent ? "text-accent-gold" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default function AICostsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [daily, setDaily] = useState<AIUsageDaily | null>(null);
  const [estimate, setEstimate] = useState<AIUsageEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [s, d, e] = await Promise.all([
      aiCostApi.getSummary(),
      aiCostApi.getDaily(30),
      aiCostApi.getEstimate(50),
    ]);
    if (s.error) {
      setError(Array.isArray(s.error.message) ? s.error.message.join(", ") : s.error.message);
      setLoading(false);
      return;
    }
    setSummary(s.data ?? null);
    setDaily(d.data ?? null);
    setEstimate(e.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <ErrorDisplay message="Bu bo'lim faqat administratorlar uchun." />
    );
  }
  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} onRetry={load} />;

  const s = summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analitika / AI"
        title="AI Xarajatlari"
        description="Gemini hujjat tekshiruvida sarflangan token va pul (USD)."
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Yangilash
          </Button>
        }
      />

      {/* Asosiy ko'rsatkichlar */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border md:grid-cols-5">
        <Stat label="Jami" value={usd(s?.total_cost_usd ?? "0", 4)} accent />
        <Stat label="Bu oy" value={usd(s?.this_month_cost_usd ?? "0", 4)} />
        <Stat label="Bugun" value={usd(s?.today_cost_usd ?? "0", 4)} />
        <Stat label="So'rovlar" value={(s?.total_requests ?? 0).toLocaleString()} />
        <Stat label="O'rtacha" value={usd(s?.avg_cost_per_request ?? "0", 5)} />
      </div>

      {/* Kunlik trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4" />
            Kunlik trend
          </CardTitle>
          <CardDescription className="text-xs">
            So&apos;nggi 30 kun · jami {(s?.total_tokens ?? 0).toLocaleString()} token
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CostBars days={daily?.days ?? []} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Model bo'yicha */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Model bo&apos;yicha</CardTitle>
          </CardHeader>
          <CardContent>
            {(s?.by_model?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Ma&apos;lumot yo&apos;q</p>
            ) : (
              <div className="divide-y">
                {s!.by_model.map((m) => (
                  <div key={m.model_name} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium">{m.model_name}</span>
                    <span className="flex items-center gap-3 font-mono tabular-nums text-muted-foreground">
                      <span>{m.requests.toLocaleString()} so&apos;rov</span>
                      <span className="font-semibold text-foreground">{usd(m.cost, 4)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Oylik taxmin */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Oylik taxmin</CardTitle>
            <CardDescription className="text-xs">
              Kuniga {estimate?.docs_per_day ?? 50} hujjat bo&apos;lsa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
              {usd(estimate?.estimated_monthly_cost_usd ?? "0", 2)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">/ oy</span>
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {estimate?.model ?? "gemini-2.5-flash"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
