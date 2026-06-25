"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  Library,
  ArrowUpRight,
  Building2,
  Briefcase,
} from "lucide-react";
import { bot2Api, catalogApi, employerApi, leadApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";

interface Stats {
  surveys: number;
  students: number;
  enrollments: number;
  catalog: number;
  employers: number;
  leads: number;
}

const cards = [
  {
    title: "So'rovnomalar",
    description: "Talabalar javoblari",
    key: "surveys" as keyof Stats,
    icon: Users,
    href: "/dashboard/surveys",
    color: "oklch(0.42 0.20 263)",
  },
  {
    title: "Talabalar",
    description: "Ro'yxatdan o'tganlar",
    key: "students" as keyof Stats,
    icon: GraduationCap,
    href: "/dashboard/students",
    color: "oklch(0.32 0.17 265)",
  },
  {
    title: "Ro'yxatga olish",
    description: "Dasturlar bo'yicha",
    key: "enrollments" as keyof Stats,
    icon: BookOpen,
    href: "/dashboard/enrollments",
    color: "oklch(0.42 0.20 263)",
  },
  {
    title: "Katalog",
    description: "Faol elementlar",
    key: "catalog" as keyof Stats,
    icon: Library,
    href: "/dashboard/catalog",
    color: "oklch(0.52 0.15 148)",
  },
  {
    title: "Ish beruvchilar",
    description: "Hamkor kompaniyalar",
    key: "employers" as keyof Stats,
    icon: Building2,
    href: "/dashboard/employers",
    color: "oklch(0.76 0.165 76)",
  },
  {
    title: "Leadlar",
    description: "Ish takliflari",
    key: "leads" as keyof Stats,
    icon: Briefcase,
    href: "/dashboard/leads",
    color: "oklch(0.76 0.165 76)",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    surveys: 0,
    students: 0,
    enrollments: 0,
    catalog: 0,
    employers: 0,
    leads: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [surveys, students, enrollments, catalog, employers, leads] = await Promise.all([
          bot2Api.listSurveys({ page_size: "1" }),
          bot2Api.listStudents({ page_size: "1" }),
          bot2Api.listEnrollments({ page_size: "1" }),
          catalogApi.list(undefined, { page_size: "1", is_active: "true" }),
          employerApi.list(),
          leadApi.list(),
        ]);
        setStats({
          surveys: surveys.data?.count ?? 0,
          students: students.data?.count ?? 0,
          enrollments: enrollments.data?.count ?? 0,
          catalog: catalog.data?.count ?? 0,
          employers: employers.data?.count ?? 0,
          leads: leads.data?.count ?? 0,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Xayrli tong";
    if (h < 18) return "Xayrli kun";
    return "Xayrli kech";
  };

  const today = new Date().toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Boshqaruv paneli"
        title={`${greeting()}${user?.email ? `, ${user.email.split("@")[0]}` : ""}`}
        description="Bandlik Markazi — umumiy ko'rsatkichlar reesti."
        actions={
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {today}
          </span>
        }
      />

      {/* Institutional register: each figure as a hairline-ruled row */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Ko&apos;rsatkich
          </span>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Soni
          </span>
        </div>
        <div>
          {cards.map((card) => {
            const Icon = card.icon;
            const count = stats[card.key];
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group relative flex items-center gap-4 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <span className="absolute left-0 top-0 h-full w-0.5 bg-accent-gold opacity-0 transition-opacity group-hover:opacity-100" />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-medium leading-tight text-foreground">
                    {card.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </div>
                {loading ? (
                  <span className="h-7 w-14 animate-pulse rounded bg-muted" />
                ) : (
                  <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {count.toLocaleString()}
                  </span>
                )}
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-accent-gold" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
