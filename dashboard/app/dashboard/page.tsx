"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  Library,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { bot2Api, catalogApi } from "@/lib/api";

interface Stats {
  surveys: number;
  students: number;
  enrollments: number;
  catalog: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    surveys: 0,
    students: 0,
    enrollments: 0,
    catalog: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [surveys, students, enrollments, catalog] = await Promise.all([
          bot2Api.listSurveys({ page_size: "1" }),
          bot2Api.listStudents({ page_size: "1" }),
          bot2Api.listEnrollments({ page_size: "1" }),
          catalogApi.list(undefined, { page_size: "1", is_active: "true" }),
        ]);

        setStats({
          surveys: surveys.data?.count ?? 0,
          students: students.data?.count ?? 0,
          enrollments: enrollments.data?.count ?? 0,
          catalog: catalog.data?.count ?? 0,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const cards = [
    {
      title: "So'rovnomalar",
      description: "Talabalar so'rovnomasi javoblari",
      count: stats.surveys,
      icon: Users,
      href: "/dashboard/surveys",
      color: "text-pink-600 dark:text-pink-400",
      bg: "bg-pink-50 dark:bg-pink-950",
    },
    {
      title: "Talabalar",
      description: "Ro'yxatdan o'tgan talabalar",
      count: stats.students,
      icon: GraduationCap,
      href: "/dashboard/students",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Talabalar soni",
      description: "Dasturlar bo'yicha talabalar",
      count: stats.enrollments,
      icon: BookOpen,
      href: "/dashboard/enrollments",
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-950",
    },
    {
      title: "Katalog",
      description: "Faol katalog elementlari",
      count: stats.catalog,
      icon: Library,
      href: "/dashboard/catalog",
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bosh sahifa</h1>
        <p className="text-muted-foreground">TTPU CRM tizimiga xush kelibsiz</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <div className={`rounded-lg p-2 ${card.bg}`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "..." : card.count.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                  <div className="mt-3 flex items-center text-xs text-primary">
                    Batafsil <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
