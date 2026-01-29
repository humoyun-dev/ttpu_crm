"use client";

import { BookOpenCheck } from "lucide-react";
import { bot1Api } from "@/lib/api";
import { ApplicationAnalytics } from "../_components/application-analytics";

export default function FoundationAnalyticsPage() {
  return (
    <ApplicationAnalytics
      title="Foundation Year Analitikasi"
      description="Tayyorlov kursi arizalari bo'yicha statistika"
      icon={BookOpenCheck}
      fetcher={bot1Api.listFoundation}
      manageHref="/dashboard/applications/foundation"
    />
  );
}
