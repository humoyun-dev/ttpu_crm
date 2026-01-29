"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type DetailData = Record<string, unknown>;

const endpointMap: Record<string, string> = {
  admissions: "bot1/applications/admissions-2026",
  campus: "bot1/applications/campus-tour",
  polito: "bot1/applications/polito-academy",
  foundation: "bot1/applications/foundation",
  surveys: "bot2/surveys",
};

export default function ApplicationDetailPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!type || !id) return;
      const endpoint = endpointMap[type];
      if (!endpoint) {
        if (active) setError("Noto'g'ri bo'lim");
        return;
      }
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/v1/${endpoint}/${id}/`, {
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
        const body = await res.json();
        if (active) setData(body as DetailData);
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
  }, [type, id, apiBase, router]);

  return (
    <main className="min-h-screen bg-background px-8 py-10 text-foreground">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ariza detali</p>
          <h1 className="text-2xl font-semibold text-white">
            {type} / {id}
          </h1>
        </div>
        <Button variant="secondary" onClick={() => router.back()}>
          Orqaga
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ID: {id}</CardTitle>
          <CardDescription>Serverdan yuklangan batafsil ma&apos;lumotlar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-6" />
          {loading && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Yuklanmoqda...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(data).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{key}</p>
                  <p className="break-all text-sm text-slate-100">
                    {typeof value === "object" ? JSON.stringify(value) : String(value ?? "-")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
