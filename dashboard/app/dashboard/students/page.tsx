"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RosterTab } from "./roster-tab";
import { EnrollmentsTab } from "./enrollments-tab";
import { ImportTab } from "./import-tab";

const TABS = [
  { key: "roster", label: "Ro'yxat" },
  { key: "enrollments", label: "Ro'yxatga olish" },
  { key: "import", label: "Import" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabKey>(isTabKey(initialTab) ? initialTab : "roster");

  const handleTabChange = (value: string) => {
    const next = isTabKey(value) ? value : "roster";
    setTab(next);
    router.replace(`/dashboard/students?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talabalar"
        title="Talabalar"
        description="Ro'yxatga olingan talabalar, dastur bo'yicha ro'yxat va import."
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          <RosterTab />
        </TabsContent>
        <TabsContent value="enrollments" className="mt-4">
          <EnrollmentsTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
