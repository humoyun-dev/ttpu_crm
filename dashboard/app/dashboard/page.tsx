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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bandlik Markazi boshqaruv paneli
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const count = stats[card.key];
          return (
            <Link key={card.href} href={card.href} className="group">
              <div className="overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div
                    className="rounded-lg p-2.5"
                    style={{
                      background: `color-mix(in oklch, ${card.color} 12%, transparent)`,
                    }}
                  >
                    <Icon className="h-5 w-5" style={{ color: card.color }} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold tracking-tight">
                    {loading ? (
                      <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-muted" />
                    ) : (
                      count.toLocaleString()
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium">{card.title}</p>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
