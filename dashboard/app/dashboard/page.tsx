"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Building2,
  FlaskConical,
  BookOpenCheck,
  Users,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { bot1Api, bot2Api } from "@/lib/api";

interface Stats {
  admissions: number;
  campus: number;
  polito: number;
  foundation: number;
  surveys: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    admissions: 0,
    campus: 0,
    polito: 0,
    foundation: 0,
    surveys: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [admissions, campus, polito, foundation, surveys] =
          await Promise.all([
            bot1Api.listAdmissions(),
            bot1Api.listCampusTours(),
            bot1Api.listPolito(),
            bot1Api.listFoundation(),
            bot2Api.listSurveys(),
          ]);

        setStats({
          admissions:
            admissions.data?.count || admissions.data?.results?.length || 0,
          campus: campus.data?.count || campus.data?.results?.length || 0,
          polito: polito.data?.count || polito.data?.results?.length || 0,
          foundation:
            foundation.data?.count || foundation.data?.results?.length || 0,
          surveys: surveys.data?.count || surveys.data?.results?.length || 0,
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
      title: "Qabul 2026",
      description: "Talabalar qabuli arizalari",
      count: stats.admissions,
      icon: GraduationCap,
      href: "/dashboard/applications/admissions",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Campus Tour",
      description: "Kampus sayohati so'rovlari",
      count: stats.campus,
      icon: Building2,
      href: "/dashboard/applications/campus",
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Polito Academy",
      description: "Polito Academy arizalari",
      count: stats.polito,
      icon: FlaskConical,
      href: "/dashboard/applications/polito",
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      title: "Foundation Year",
      description: "Tayyorlov yili arizalari",
      count: stats.foundation,
      icon: BookOpenCheck,
      href: "/dashboard/applications/foundation",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      title: "So'rovnomalar",
      description: "Alumni so'rovnomalari",
      count: stats.surveys,
      icon: Users,
      href: "/dashboard/surveys",
      color: "text-pink-600",
      bg: "bg-pink-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bosh sahifa</h1>
        <p className="text-muted-foreground">TTPU CRM tizimiga xush kelibsiz</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
