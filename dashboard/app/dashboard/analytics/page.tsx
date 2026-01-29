"use client";

import Link from "next/link";
import {
  GraduationCap,
  Building2,
  FlaskConical,
  BookOpenCheck,
  Users,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const analyticsCategories = [
  {
    title: "Qabul 2026",
    description: "2026-yil qabul arizalari bo'yicha statistika",
    href: "/dashboard/analytics/admissions",
    icon: GraduationCap,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  {
    title: "Campus Tour",
    description: "Kampus turiga arizalar analitikasi",
    href: "/dashboard/analytics/campus",
    icon: Building2,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
  },
  {
    title: "Polito Academy",
    description: "Polito akademiyasi bo'yicha ma'lumotlar",
    href: "/dashboard/analytics/polito",
    icon: FlaskConical,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
  },
  {
    title: "Foundation Year",
    description: "Tayyorlov kursi arizalari tahlili",
    href: "/dashboard/analytics/foundation",
    icon: BookOpenCheck,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950",
  },
  {
    title: "So'rovnoma",
    description: "Talabalar so'rovnomasi va bandlik statistikasi",
    href: "/dashboard/analytics/surveys",
    icon: Users,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950",
  },
  {
    title: "Talabalar soni",
    description: "Umumiy talabalar soni va qamrov",
    href: "/dashboard/analytics/enrollments",
    icon: BarChart3,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
  },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analitika</h2>
          <p className="text-muted-foreground">
            Barcha bo&apos;limlar bo&apos;yicha statistika va tahlillar
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {analyticsCategories.map((category) => {
          const Icon = category.icon;
          return (
            <Link key={category.href} href={category.href}>
              <Card className="group cursor-pointer hover:shadow-lg transition-all duration-200 h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-3 rounded-lg ${category.bgColor} transition-transform group-hover:scale-110`}
                    >
                      <Icon className={`h-6 w-6 ${category.color}`} />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <CardTitle className="mt-4">{category.title}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Batafsil ma&apos;lumot uchun bosing
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analitika haqida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ushbu bo&apos;limda siz turli xil statistik ma&apos;lumotlarni
            ko&apos;rishingiz mumkin:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Arizalar soni va dinamikasi
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Yo&apos;nalishlar va fanlar bo&apos;yicha taqsimlanish
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Talabalar so&apos;rovnomasi va bandlik ma&apos;lumotlari
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Qamrov va ishtirok foizlari
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
