"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { bot1Api, catalogApi, CatalogItem } from "@/lib/api";
import { ApplicationAnalytics } from "../_components/application-analytics";

export default function PolitoAnalyticsPage() {
  const [subjects, setSubjects] = useState<CatalogItem[]>([]);

  useEffect(() => {
    catalogApi.list("subject", { page_size: "200" }).then((res) => {
      if (res.data?.results) setSubjects(res.data.results);
    });
  }, []);

  return (
    <ApplicationAnalytics
      title="Polito Academy Analitikasi"
      description="Polito akademiyasi arizalari bo'yicha statistika"
      icon={FlaskConical}
      fetcher={bot1Api.listPolito}
      manageHref="/dashboard/applications/polito"
      extraFilters={[
        {
          key: "subject",
          label: "Fan",
          options: subjects.map((s) => ({ label: s.name, value: s.id })),
        },
      ]}
    />
  );
}
