"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  Library,
  ArrowRight,
  TrendingUp,
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
    accent: "bg-violet-500",
    light: "bg-violet-50 dark:bg-violet-950/40",
    text: "text-violet-600 dark:text-violet-400",
  },
  {
    title: "Talabalar",
    description: "Ro'yxatdan o'tganlar",
    key: "students" as keyof Stats,
    icon: GraduationCap,
    href: "/dashboard/students",
    accent: "bg-blue-500",
    light: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "Ro'yxatga olish",
    description: "Dasturlar bo'yicha",
    key: "enrollments" as keyof Stats,
    icon: BookOpen,
    href: "/dashboard/enrollments",
    accent: "bg-indigo-500",
    light: "bg-indigo-50 dark:bg-indigo-950/40",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  {
    title: "Katalog",
    description: "Faol elementlar",
    key: "catalog" as keyof Stats,
    icon: Library,
    href: "/dashboard/catalog",
    accent: "bg-emerald-500",
    light: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Ish beruvchilar",
    description: "Hamkor kompaniyalar",
    key: "employers" as keyof Stats,
    icon: Building2,
    href: "/dashboard/employers",
    accent: "bg-orange-500",
    light: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-600 dark:text-orange-400",
  },
  {
    title: "Leadlar",
    description: "Ish takliflari",
    key: "leads" as keyof Stats,
    icon: Briefcase,
    href: "/dashboard/leads",
    accent: "bg-pink-500",
    light: "bg-pink-50 dark:bg-pink-950/40",
    text: "text-pink-600 dark:text-pink-400",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ surveys: 0, students: 0, enrollments: 0, catalog: 0, employers: 0, leads: 0 });
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}{user?.email ? `, ${user.email.split("@")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            TTPU CRM tizimiga xush kelibsiz
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 dark:bg-emerald-950/40">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Tizim faol</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const count = stats[card.key];
          return (
            <Link key={card.href} href={card.href} className="group">
              <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div className={`rounded-xl p-2.5 ${card.light}`}>
                    <Icon className={`h-5 w-5 ${card.text}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
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
                {/* Accent bar */}
                <div className={`absolute bottom-0 left-0 h-1 w-full ${card.accent} opacity-0 transition-opacity group-hover:opacity-100`} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tezkor havolalar
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Yangi so'rovnomalar", href: "/dashboard/surveys", sub: "Oxirgi kiritilgan javoblar" },
            { label: "Talabalar ro'yxati", href: "/dashboard/students", sub: "Barcha ro'yxatdagi talabalar" },
            { label: "Katalog boshqaruvi", href: "/dashboard/catalog", sub: "Yo'nalish va dasturlar" },
            { label: "Ish beruvchilar", href: "/dashboard/employers", sub: "Hamkor kompaniyalar" },
            { label: "Leadlar", href: "/dashboard/leads", sub: "Ish takliflari" },
            { label: "Hisobotlar", href: "/dashboard/reports", sub: "Yo'nalish bo'yicha statistika" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <div>
                <p className="font-medium">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.sub}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
