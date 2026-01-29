"use client";

import { GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { bot1Api, catalogApi, CatalogItem } from "@/lib/api";
import { ApplicationAnalytics } from "../_components/application-analytics";

export default function AdmissionsAnalyticsPage() {
  const [directions, setDirections] = useState<CatalogItem[]>([]);
  const [tracks, setTracks] = useState<CatalogItem[]>([]);

  useEffect(() => {
    catalogApi.list("direction", { page_size: "200" }).then((res) => {
      if (res.data?.results) setDirections(res.data.results);
    });
    catalogApi.list("track", { page_size: "200" }).then((res) => {
      if (res.data?.results) setTracks(res.data.results);
    });
  }, []);

  return (
    <ApplicationAnalytics
      title="Qabul 2026 Analitikasi"
      description="2026-yil qabul arizalari bo'yicha statistika"
      icon={GraduationCap}
      fetcher={bot1Api.listAdmissions}
      manageHref="/dashboard/applications/admissions"
      extraFilters={[
        {
          key: "direction",
          label: "Yo'nalish",
          options: directions.map((d) => ({ label: d.name, value: d.id })),
        },
        {
          key: "track",
          label: "Track",
          options: tracks.map((t) => ({ label: t.name, value: t.id })),
        },
      ]}
    />
  );
}
