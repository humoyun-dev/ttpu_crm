"use client";

import Link from "next/link";
import { Users, ArrowUpRight, BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

const analyticsCategories = [
  {
    title: "So'rovnoma",
    description: "Talabalar so'rovnomasi va bandlik statistikasi",
    href: "/dashboard/analytics/surveys",
    icon: Users,
  },
  {
    title: "Talabalar soni",
    description: "Umumiy talabalar soni va qamrov ko'rsatkichlari",
    href: "/dashboard/analytics/enrollments",
    icon: BarChart3,
  },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analitika"
        title="Analitika"
        description="Statistika va tahlillar bo'limlari reesti."
      />

      {/* Institutional register: each section as a hairline-ruled row */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-2.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Bo&apos;lim
          </span>
        </div>
        <div>
          {analyticsCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.href}
                href={category.href}
                className="group relative flex items-center gap-4 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <span className="absolute left-0 top-0 h-full w-0.5 bg-accent-gold opacity-0 transition-opacity group-hover:opacity-100" />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-medium leading-tight text-foreground">
                    {category.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{category.description}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-accent-gold" />
              </Link>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Analitika haqida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ushbu bo&apos;limda siz quyidagi statistik ma&apos;lumotlarni ko&apos;rishingiz mumkin:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" />
              Talabalar so&apos;rovnomasi va bandlik ma&apos;lumotlari
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" />
              Dasturlar bo&apos;yicha qamrov va ishtirok foizlari
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" />
              Kurs yillari bo&apos;yicha talabalar soni dinamikasi
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
