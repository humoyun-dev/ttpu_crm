"use client";

import { Building2 } from "lucide-react";
import { bot1Api } from "@/lib/api";
import { ApplicationAnalytics } from "../_components/application-analytics";

export default function CampusAnalyticsPage() {
  return (
    <ApplicationAnalytics
      title="Campus Tour Analitikasi"
      description="Kampus turiga arizalar bo'yicha statistika"
      icon={Building2}
      fetcher={bot1Api.listCampusTours}
      manageHref="/dashboard/applications/campus"
    />
  );
}
